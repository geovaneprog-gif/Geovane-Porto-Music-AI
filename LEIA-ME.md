# Geovane Porto Studio — controles de consistência

Atualização do frontend claro e do backend. Faça backup e copie ambos sobre o projeto existente. Nenhum arquivo do motor MuLaCover precisa ser alterado. Preserve .venv, modelos, uploads e outputs.

## Aplicar no Mac

Pare frontend e backend com Ctrl+C. Baixe Geovane-Porto-Studio-Claro.zip para Downloads e execute:

```bash
cd ~/Downloads
unzip -o Geovane-Porto-Studio-Claro.zip -d geovane-porto-cover
cd geovane-porto-cover/backend
source .venv/bin/activate
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Em outro Terminal:

```bash
cd ~/Downloads/geovane-porto-cover/frontend
npm start
```

Abra http://localhost:4200 e use Command+Shift+R. Se necessário, instale as dependências do frontend com npm ci. O MuLaCover é localizado em ~/Downloads/MuLaCover; use MULACOVER_DIR para outro caminho. Use um único processo uvicorn.

## Primeiro teste com a referência Connie

- Cole a letra original completa, preservando repetições e seções. O campo inicia vazio para evitar letra de exemplo.
- Use o preset “Teste conservador • Freestyle”. Ele modifica tags e amostragem, não letra/BPM/seed/duração.
- Seed 42; temperature 0,8; top-k 100; CFG 2,0.
- Limite 320 segundos, maior que os 311,43 segundos da referência enviada.
- BPM: 0 para detectar, ou 123 apenas se esse for o andamento confirmado da referência. O número não foi medido nesta atualização.
- Compare com “Amostragem original”: temperature 1,0; top-k 250; CFG 1,5. Mantenha tags, letra, referência, seed e BPM iguais para isolar o efeito da amostragem. Depois altere um parâmetro por vez.

O preset conservador é experimental. Reduzir temperature e top-k concentra a distribuição de amostragem, mas não comprova maior fidelidade. CFG reforça conjuntamente letra, estilo e condicionamento simbólico; não é controle exclusivo da melodia.

## O que a análise do motor encontrou

Fonte: código enviado de MuLaCover, especialmente src/mulacover/symbolic.py, pipeline.py, modeling.py e cli.py.

1. A transcrição identifica notas, bateria e acordes. O condicionamento melódico seleciona as notas do programa 100 (voz principal); outras linhas instrumentais não são preservadas como pistas independentes.
2. Notas e acordes são quantizados numa grade de semicolcheias. Isso reduz a precisão das nuances de tempo.
3. BPM é usado na conversão da transcrição. O próprio código informa que não é um condicionamento independente e não fixa o andamento gerado.
4. A letra entra como texto, sem alinhamento explícito sílaba/tempo. Preservar a letra não trava pausas e durações vocais.
5. O limite padrão era 300 segundos. Agora está exposto na interface, com 320 por padrão. É um teto, não uma duração obrigatória: o token EOS pode encerrar a geração antes. A referência tem 311,43 s e o resultado enviado 244,4 s; sem o log daquele trabalho, não é possível confirmar a razão específica da diferença.
6. Não existe reference_strength ou modo de cópia exata no CLI enviado. Nenhum parâmetro fictício foi adicionado.

## Diagnóstico MIDI

Após concluir, baixe “Melodia MIDI”, “Acordes MIDI” e “Bateria MIDI” no painel de resultado. Abra no seu DAW e compare com a referência. Se a melodia transcrita estiver incorreta, mudar tags não corrige essas notas: será necessário revisar a transcrição ou fornecer MIDI corrigido usando o modo MIDI já existente no CLI. A interface desta atualização ainda não recebe MIDI de entrada.

Os parâmetros são registrados em jobs/<id>/parameters.json; logs em generation.log. O gráfico representa envio ou etapa reportada, não porcentagem global calculada.

## Validação

Passaram compilação Angular TypeScript/templates, compilação SCSS, sintaxe Python e verificação isolada do envio dos parâmetros ao subprocesso, incluindo BPM automático/explicitado e conversão da duração para milissegundos. Os testes Angular atualizados estão incluídos. O build completo Linux, inspeção visual e inferência real não foram executados; a confirmação musical depende de testes com o motor e os modelos no Mac.
