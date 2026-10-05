import { Component, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpEventType } from '@angular/common/http';

interface Job { status: string; job_id: string; progress: number | null; stage: string; audio_url?: string; error?: string; }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  view: 'create' | 'library' | 'about' = 'create';
  search = '';
  tracks: { id: string; title: string; style: string; seed: number; createdAt: string; audioUrl: string; midiBase: string | null }[] = [];
  get filteredTracks() {
    const query = this.search.trim().toLocaleLowerCase('pt-BR');
    return this.tracks.filter(track => (track.title + ' ' + track.style).toLocaleLowerCase('pt-BR').includes(query));
  }

  progress: number | null = 0;
  phase = 'ready';
  elapsed = 0;
  private polling?: ReturnType<typeof setTimeout>;
  private clock?: ReturnType<typeof setInterval>;
  private disposed = false;
  get ringOffset(): number { return 326.73 * (1 - (this.progress ?? 0) / 100); }
  get elapsedLabel(): string { return `${Math.floor(this.elapsed / 60)}:${String(this.elapsed % 60).padStart(2, '0')}`; }
  ngOnDestroy(): void { this.disposed = true; clearTimeout(this.polling); clearInterval(this.clock); }


  selectedFile: File | null = null;
  bpm = 0;
  temperature = 0.8;
  topk = 100;
  cfgScale = 2;
  maxDuration = 320;
  midiBase: string | null = null;
  applyConsistencyPreset(): void {
    this.temperature = 0.8; this.topk = 100; this.cfgScale = 2;
    this.tags = 'topic:[Dance]; genre:[Latin freestyle, synth pop]; instrument:[TR-808 drum machine, electronic percussion, synthesizer, synth bass]; mood:[energetic, rhythmic]';
  }
  applyOriginalSampling(): void {
    this.temperature = 1; this.topk = 250; this.cfgScale = 1.5;
  }


  lyrics = '';
  tags = 'topic:[Dance]; genre:[Latin freestyle, synth pop]; instrument:[TR-808 drum machine, electronic percussion, synthesizer, synth bass]; mood:[energetic, rhythmic]';

  seed = 42;
  device = 'mps';

  generating = false;
  status = 'Pronto para gerar';
  errorMessage = '';

  audioUrl: string | null = null;

  private readonly apiUrl =
    'http://127.0.0.1:8000';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  onFileSelected(event: Event): void {

    const input =
      event.target as HTMLInputElement;

    if (
      input.files &&
      input.files.length > 0
    ) {

      this.selectedFile =
        input.files[0];

      this.status =
        `Referência selecionada: ${this.selectedFile.name}`;

    }
  }


  generate(): void {
    if (this.generating) return;

    if (!this.selectedFile) {

      this.errorMessage =
        'Selecione uma música de referência.';

      return;
    }

    if (!this.lyrics.trim()) {

      this.errorMessage =
        'Informe a letra da música.';

      return;
    }

    if (!this.tags.trim()) {

      this.errorMessage =
        'Informe o estilo da música.';

      return;
    }

    if (![this.bpm, this.temperature, this.topk, this.cfgScale, this.maxDuration, this.seed].every(Number.isFinite)
        || this.bpm < 0 || this.bpm > 300 || this.temperature < 0.1 || this.temperature > 2
        || !Number.isInteger(this.topk) || this.topk < 1 || this.topk > 8192
        || this.cfgScale < 1 || this.cfgScale > 5 || !Number.isInteger(this.maxDuration)
        || this.maxDuration < 10 || this.maxDuration > 600 || !Number.isInteger(this.seed)) {
      this.errorMessage = 'Confira os valores de BPM, amostragem, duração e seed.';
      return;
    }
    this.midiBase = null;
    this.generating = true;

    this.errorMessage = '';

    this.audioUrl = null;

    this.status =
      'Gerando cover... Esse processo pode levar alguns minutos.';


    const formData =
      new FormData();

    formData.append(
      'audio',
      this.selectedFile
    );

    formData.append(
      'lyrics',
      this.lyrics
    );

    formData.append(
      'tags',
      this.tags
    );

    formData.append(
      'seed',
      this.seed.toString()
    );

    formData.append(
      'device',
      this.device
    );


    formData.append('bpm', String(this.bpm));
    formData.append('temperature', String(this.temperature));
    formData.append('topk', String(this.topk));
    formData.append('cfg_scale', String(this.cfgScale));
    formData.append('max_duration', String(this.maxDuration));
    this.phase = 'upload';
    this.progress = 0;
    this.elapsed = 0;
    this.status = 'Enviando referência';
    this.clock = setInterval(() => { this.elapsed++; this.cdr.markForCheck(); }, 1000);
    this.http.post<Job>(`${this.apiUrl}/api/generate`, formData, {
      observe: 'events', reportProgress: true
    }).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress) {
          this.progress = event.total ? Math.round(100 * event.loaded / event.total) : null;
        } else if (event.type === HttpEventType.Response && event.body) {
          this.applyJob(event.body);
          if (this.generating) this.poll(event.body.job_id);
        }
        this.cdr.markForCheck();
      },
      error: error => this.fail(typeof error?.error?.detail === 'string' ? error.error.detail : 'Não foi possível iniciar. Confira o backend e os valores dos parâmetros.')
    });
  }

  private poll(id: string): void {
    this.polling = setTimeout(() => {
      if (this.disposed) return;
      this.http.get<Job>(`${this.apiUrl}/api/jobs/${id}`).subscribe({
        next: job => { this.applyJob(job); if (this.generating) this.poll(id); },
        error: () => this.fail('A consulta do andamento falhou. O processo pode continuar no servidor. ID: ' + id)
      });
    }, 1500);
  }
  private applyJob(job: Job): void {
    this.midiBase = `${this.apiUrl}/api/jobs/${job.job_id}/midi`;
    this.phase = job.status;
    this.progress = job.progress;
    this.status = job.stage;
    if (job.status === 'completed') {
      this.generating = false;
      this.progress = 100;
      if (!job.audio_url) { this.fail('O servidor concluiu a geração sem informar o áudio.'); return; }
      this.audioUrl = new URL(job.audio_url, this.apiUrl).href;
      if (!this.tracks.some(track => track.id === job.job_id)) {
        this.tracks.unshift({ id: job.job_id, title: this.selectedFile?.name.replace(/\.[^.]+$/, '') || 'Nova produção',
          style: this.tags, seed: this.seed, createdAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          audioUrl: this.audioUrl, midiBase: this.midiBase });
      }
      clearInterval(this.clock);
    } else if (job.status === 'error') this.fail(job.error || 'Falha na geração.');
    this.cdr.markForCheck();
  }
  private fail(message: string): void {
    this.generating = false;
    this.phase = 'error';
    this.status = 'Não foi possível concluir';
    this.errorMessage = message;
    clearInterval(this.clock);
    clearTimeout(this.polling);
    this.cdr.markForCheck();
  }


  presetFunkMelody(): void {

    this.tags =
      'topic:[Romance]; genre:[Brazilian funk melody, hip hop, electronic]; instrument:[808 bass, electronic drums, synthesizer, piano]; mood:[melodic, emotional, nostalgic, energetic]';

  }


  presetHipHop(): void {

    this.tags =
      'topic:[Urban]; genre:[hip hop, rap, trap]; instrument:[808 bass, punchy drums, synthesizer, piano]; mood:[energetic, powerful, modern]';

  }


  presetFunk90(): void {

    this.tags =
      'topic:[Dance]; genre:[Brazilian funk, funk melody, 90s dance]; instrument:[drum machine, synthesizer, bass, piano]; mood:[nostalgic, energetic, melodic]';

  }


  reset(): void {
    if (this.generating) return;
    this.progress = 0; this.phase = "ready"; this.elapsed = 0; this.midiBase = null;

    this.selectedFile = null;

    this.audioUrl = null;

    this.errorMessage = '';

    this.seed = 42;

    this.device = 'mps';

    this.status =
      'Pronto para gerar';

  }

}
