from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path

import subprocess
import uuid
import shutil
import os
import re
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from fastapi import HTTPException

executor = ThreadPoolExecutor(max_workers=1)
job_lock = threading.Lock()
job_states = {}

def set_job(job_id, **values):
    with job_lock:
        job_states[job_id].update(values)
        state = dict(job_states[job_id])
        target = JOB_DIR / job_id / 'status.json'
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        temporary.replace(target)

def run_job(job_id, command, env, output_file):
    set_job(job_id, status='running', stage='Processando referência e gerando áudio', progress=None)
    try:
        log_path = JOB_DIR / job_id / 'generation.log'
        tail = ''
        with log_path.open('w', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=str(MULACOVER_DIR), env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                encoding='utf-8', errors='replace', bufsize=1)
            fragment = ''
            # tqdm uses carriage returns rather than newlines.
            while True:
                char = process.stdout.read(1)
                if not char: break
                log.write(char)
                tail = (tail + char)[-6000:]
                if char in '\r\n':
                    match = re.search(r'(\d{1,3})%\|', fragment)
                    if match:
                        set_job(job_id, progress=min(100, int(match.group(1))),
                            stage='Processando — progresso da etapa atual')
                    elif fragment.strip():
                        set_job(job_id, progress=None, stage='Processando referência e gerando áudio')
                    fragment = ''
                    log.flush()
                else: fragment += char
            code = process.wait()
        if code != 0:
            raise RuntimeError(tail or f'Motor encerrado com código {code}')
        if not output_file.is_file() or output_file.stat().st_size == 0:
            raise RuntimeError('O motor terminou sem produzir um arquivo de áudio válido.')
        set_job(job_id, status='completed', progress=100, stage='Cover gerado com sucesso!',
            audio_url=f'/api/audio/{job_id}')
    except Exception as exc:
        set_job(job_id, status='error', progress=None, stage='Falha na geração', error=str(exc)[-6000:])


app = FastAPI(title="Geovane Porto Cover API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MULACOVER_DIR = Path(os.getenv("MULACOVER_DIR", str(Path.home() / "Downloads/MuLaCover")))
MULACOVER_BIN = MULACOVER_DIR / ".venv/bin/mulacover"
MODEL_PATH = MULACOVER_DIR / "ckpt"

APP_DIR = Path(os.getenv("COVER_APP_DIR", str(Path(__file__).resolve().parent.parent)))

UPLOAD_DIR = APP_DIR / "uploads"
OUTPUT_DIR = APP_DIR / "outputs"
JOB_DIR = APP_DIR / "jobs"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
JOB_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/api/health")
def health():
    return {
        "api": "online",
        "mulacover": MULACOVER_BIN.exists(),
        "models": MODEL_PATH.exists(),
    }

@app.post("/api/generate")
async def generate(
    audio: UploadFile = File(...),
    lyrics: str = Form(...),
    tags: str = Form(...),
    seed: int = Form(42),
    device: str = Form("mps"),
    bpm: float = Form(0, ge=0, le=300),
    temperature: float = Form(0.8, ge=0.1, le=2),
    topk: int = Form(100, ge=1, le=8192),
    cfg_scale: float = Form(2.0, ge=1, le=5),
    max_duration: int = Form(320, ge=10, le=600),
):
    if not MULACOVER_BIN.is_file() or not MODEL_PATH.is_dir():
        raise HTTPException(503, 'MuLaCover ou modelos não encontrados. Verifique MULACOVER_DIR.')
    job_id = str(uuid.uuid4())

    current_job = JOB_DIR / job_id
    current_job.mkdir(parents=True, exist_ok=True)

    audio_suffix = Path(audio.filename or "reference.wav").suffix or ".wav"

    input_audio = UPLOAD_DIR / f"{job_id}{audio_suffix}"
    lyrics_file = current_job / "lyrics.txt"
    tags_file = current_job / "tags.txt"
    symbolic_dir = current_job / "transcribed"
    output_file = OUTPUT_DIR / f"{job_id}.wav"

    symbolic_dir.mkdir(parents=True, exist_ok=True)

    with input_audio.open("wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    lyrics_file.write_text(lyrics, encoding="utf-8")
    tags_file.write_text(tags, encoding="utf-8")

    if device not in {"mps", "cpu"}:
        device = "mps"

    command = [
        str(MULACOVER_BIN),
        "--model_path", str(MODEL_PATH),
        "--ref_audio", str(input_audio),
        "--lyrics", str(lyrics_file),
        "--tags", str(tags_file),
        "--symbolic_save_dir", str(symbolic_dir),
        "--save_path", str(output_file),
        "--device", device,
        "--seed", str(seed),
    ]

    command.extend([
        '--temperature', str(temperature), '--topk', str(topk),
        '--cfg_scale', str(cfg_scale),
        '--max_audio_length_ms', str(max_duration * 1000),
    ])
    if bpm > 0:
        command.extend(['--bpm', str(bpm)])
    parameters = dict(bpm=bpm or None, temperature=temperature, topk=topk,
        cfg_scale=cfg_scale, max_duration=max_duration, seed=seed, device=device)
    (current_job / 'parameters.json').write_text(
        json.dumps(parameters, ensure_ascii=False, indent=2), encoding='utf-8')

    env = os.environ.copy()
    env["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
    env["TOKENIZERS_PARALLELISM"] = "false"

    env['PYTHONUNBUFFERED'] = '1'
    with job_lock:
        job_states[job_id] = {'job_id': job_id, 'parameters': parameters}
    set_job(job_id, status='queued', progress=None, stage='Na fila de produção')
    executor.submit(run_job, job_id, command, env, output_file)
    with job_lock:
        return dict(job_states[job_id])

@app.get('/api/jobs/{job_id}')
def get_job(job_id: uuid.UUID):
    key = str(job_id)
    with job_lock:
        if key in job_states:
            return dict(job_states[key])
    saved = JOB_DIR / key / 'status.json'
    if not saved.exists():
        raise HTTPException(404, 'Produção não encontrada')
    state = json.loads(saved.read_text(encoding='utf-8'))
    if state['status'] in {'queued', 'running'}:
        state.update(status='error', progress=None, stage='Produção interrompida',
            error='O servidor reiniciou durante a produção. Inicie uma nova geração.')
    return state

@app.get("/api/audio/{job_id}")
def get_audio(job_id: uuid.UUID):
    file = OUTPUT_DIR / f"{job_id}.wav"

    if not file.exists():
        raise HTTPException(404, 'Arquivo não encontrado')

    return FileResponse(
        file,
        media_type="audio/wav",
        filename=f"Geovane-Porto-Cover-{job_id}.wav",
    )

@app.get('/api/jobs/{job_id}/midi/{track}')
def get_midi(job_id: uuid.UUID, track: str):
    if track not in {'melody', 'chords', 'drums'}:
        raise HTTPException(404, 'Pista MIDI não encontrada')
    path = JOB_DIR / str(job_id) / 'transcribed' / f'{track}.mid'
    if not path.is_file():
        raise HTTPException(404, 'MIDI ainda não disponível')
    return FileResponse(path, media_type='audio/midi', filename=f'{job_id}-{track}.mid')
