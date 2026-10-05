# Geovane Porto Music AI — novo estúdio

Interface Angular inspirada na organização do Suno, com identidade própria: navegação lateral, painel de criação, biblioteca de sessão, busca, player, arquivos MIDI, tema escuro com coral e layout responsivo.

## Como instalar no Mac

1. Pare o frontend com Ctrl+C no terminal onde ele está rodando.
2. Guarde uma cópia da pasta frontend atual.
3. Extraia este ZIP e coloque a nova pasta frontend dentro de ~/Downloads/geovane-porto-cover/.
4. No Terminal:

```bash
cd ~/Downloads/geovane-porto-cover/frontend
npm ci
npm start
```

Abra http://localhost:4200. Continue iniciando seu backend da mesma forma que já usa; ele precisa responder em http://127.0.0.1:8000.

## Recursos e limites

- Todos os parâmetros e endpoints existentes foram mantidos.
- Configurações de seed, dispositivo e amostragem ficam em “Configurações avançadas”.
- Ao concluir, cada produção entra na biblioteca com player e links de áudio/MIDI.
- A biblioteca dura apenas nesta sessão da página. Recarregar limpa a lista; não exclui arquivos do backend.
- O frontend não busca gerações antigas do servidor: a API enviada no código não possui uma listagem de histórico.
- O indicador mostra a porcentagem do upload ou da etapa informada pelo motor, não uma estimativa global. Etapas sem medição exibem atividade.
- A identificação “Motor de geração local” descreve a configuração, não é uma verificação de disponibilidade.
- A geração de IA permanece experimental; este redesign não muda a qualidade do modelo.
- Sem deploy nesta etapa. O backend local deve estar ativo para gerar ou reproduzir seus resultados.

## Validação

Compilação de produção e os dois testes existentes aprovados. Confira VALIDACAO.md para a verificação da interface.

Principais arquivos modificados: src/app/app.html, src/app/app.scss, src/app/app.ts, src/styles.scss e angular.json. O orçamento de CSS do componente foi ajustado para acomodar o layout e os pontos de quebra responsivos.
