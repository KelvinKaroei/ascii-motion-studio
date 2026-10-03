# ASCII Motion Studio

**Projeto experimental para avaliação e sugestões da comunidade.** Validado no ambiente Windows de desenvolvimento; os alvos macOS e Linux não foram validados. Instaladores, mídias pessoais, dependências e modelos baixados não acompanham este repositório.

Estúdio desktop local de imagens e vídeos ASCII. Electron + React + TypeScript, FFmpeg, xterm.js e dois Web Workers. Arraste uma mídia ou use **Nova mídia**: a detecção, decodificação e reprodução começam automaticamente.

## Executar

Requer Node.js 22.12+ e npm. Na pasta do projeto:

```bash
npm install
npm run dev
```

O comando padrão de scripts npm é `npm run dev` (não `npm dev`). A primeira instalação baixa Electron, FFmpeg, FFprobe e o modelo local de recorte MediaPipe; requer internet. Depois, processamento e exportação funcionam offline. Não há serviços externos, chaves de API ou FFmpeg de sistema obrigatórios. Se sua política npm bloquear scripts de instalação, permita os scripts de `electron`, `ffmpeg-static` e `esbuild`. `npm run prepare:vision` prepara o runtime WASM e baixa o modelo se ele estiver ausente; esse passo também roda antes de desenvolvimento e build.

```bash
npm run typecheck
npm test
npm run test:desktop
npm run test:vision
npm run build
npm start
npm run dist
```

`build` gera `out/`; `dist` usa electron-builder para criar um instalador para o sistema atual em `release/`. Assinatura de código e notarização dependem dos certificados do distribuidor. É possível apontar binários próprios por `FFMPEG_PATH` e `FFPROBE_PATH`.

`test` cobre o conversor, o cache e a leitura real dos nove formatos pelo FFmpeg. `test:desktop` abre uma janela offscreen do Electron, importa um vídeo, verifica o início automático e exporta os quatro formatos, conferindo a contagem de frames em MP4/GIF. Evidências e mídias temporárias ficam em `.tmp/smoke/`.

## Uso

- MP4, MOV, AVI, MKV, WEBM, GIF, PNG, JPG/JPEG e WEBP, sujeitos aos codecs do FFmpeg empacotado. GIF animado é tratado como sequência de frames. WEBP estático é suportado; a leitura de WEBP animado depende da versão do decoder FFmpeg.
- Importação por drag-and-drop ou seletor nativo; `Ctrl/⌘ + O` abre o seletor.
- Espaço alterna play/pause. A barra permite buscar uma posição. Velocidades: 0,25× a 2×.
- Largura e altura independentes; a importação sugere altura pela proporção da mídia e da célula monoespaçada.
- Densidade controla a curva de luminância. Rampa personalizável do escuro para o claro. Caracteres de controle, emojis e glifos largos são filtrados para preservar o alinhamento do terminal.
- True Color 24 bits, ANSI 256 cores, preto e branco e Unicode Blocks. Presets Matrix, CRT e Retro aplicam paletas próprias; CRT acrescenta scanlines na prévia.
- Comparação exibe a amostra RGB do FFmpeg usada na conversão, perfeitamente alinhada ao frame ASCII. Não é uma prévia do arquivo original em resolução integral.
- Ajustes de cor, densidade e caracteres atualizam também o frame pausado. Alterar a resolução reposiciona o decoder próximo ao tempo atual.

## Mais caracteres, detalhes e remoção de fundo

Na lateral, a seção **Caracteres** oferece Fotográfico, Letras, Números, Alfanumérico, ASCII completo (os 95 caracteres ASCII imprimíveis), Blocos, Binário e Minimal. A opção de ordenar por densidade mede a cobertura real dos glifos na fonte monoespaçada e organiza a rampa. Desative para manter sua ordem manual. “Todos” não inclui controles de terminal, emojis ou caracteres de largura dupla.

**Detalhes** inclui contraste, nitidez por unsharp mask, contraste automático por percentis e dithering Floyd–Steinberg. O preset **Retrato detalhado** combina esses ajustes com uma rampa longa. Mais caracteres aumentam a variedade de tons; para aumentar o detalhe espacial também é preciso aumentar a resolução da grade. O contraste automático pode oscilar entre frames de vídeo.

**Remover fundo** possui quatro opções:

- **Manter fundo original:** mantém a imagem completa.
- **Remover fundo · manter pessoas:** MediaPipe Selfie Segmenter v1 mantém as pessoas, inclusive paradas, e apaga o cenário. Sensibilidade do recorte e suavização de bordas são ajustáveis. Pessoas pequenas, cabelo fino e objetos nas mãos podem ter falhas; não é um recortador universal de objetos.
- **Somente movimento · vídeo:** diferenças entre frames com pequena persistência temporal. Precisa de câmera fixa; o primeiro frame inicia a referência e aparece vazio. Áreas paradas desaparecem e movimento da câmera também é detectado. Para preservar uma pessoa inteira, use o modo anterior.
- **Remover uma cor · chroma key:** escolhe a cor do cenário e a tolerância. Também pode apagar cores semelhantes no sujeito.

O fundo removido vira células vazias sobre o fundo escuro do terminal. O mesmo recorte é aplicado às quatro exportações; isso **não adiciona um canal alpha/transparência** ao MP4/GIF. Todos os modelos e frames ficam no computador. A primeira ativação do modo de pessoas carrega o modelo e pode demorar mais; esse modo consome mais CPU e memória que a conversão simples. Cada worker mantém seu próprio modelo e o último resultado, sem guardar máscaras de vídeos inteiros.

`npm run test:vision` usa uma fotografia oficial de teste do MediaPipe, verifica que o primeiro plano continua visível e que os cantos do cenário foram apagados, e testa uma sequência de seis frames e sua exportação MP4. A foto de teste é baixada uma vez se faltar; evidências ficam em `.tmp/vision-smoke/`.

Referência do modelo e comportamento: [MediaPipe Image Segmenter para web](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js).

## Exportação

O botão de exportação abre o seletor de formato e o diálogo nativo para o destino. O arquivo final só é renomeado após terminar. Cancelamento remove o arquivo temporário.

| Formato | Resultado                                                                 |
| ------- | ------------------------------------------------------------------------- |
| MP4     | Vídeo H.264, yuv420p, cores rasterizadas, velocidade selecionada          |
| GIF     | Animação em loop com paleta calculada por frame                           |
| HTML    | Arquivo independente, responsivo, cores, play/pause e relógio de animação |
| TXT     | Todos os frames em texto, separados por form feed, sem escapes ANSI       |

Exportações usam a mídia inteira e uma cópia dos ajustes no início, sem áudio. Imagens estáticas geram um frame. O HTML é escrito incrementalmente pelo app, mas o navegador carrega sua animação inteira; prefira MP4 para vídeos longos. Scanlines CRT são um efeito da interface e não entram no arquivo exportado. A paleta CRT entra em todos os formatos com cor.

## Arquitetura

```text
electron/
  index.ts           Janela, IPC validado, exportação com backpressure
  preload.ts         Ponte tipada e restrita; sem Node no renderer
  media.ts           FFprobe, capacidades de mídia e decoder rawvideo
src/
  components/        Terminal xterm.js e ajuste de tamanho
  engine/
    ascii.ts         Conversor puro e quantização ANSI
    ascii.worker.ts  Conversão fora da thread da interface
    pool.ts          Workers independentes e cache LRU de 12 MiB
    export.ts        HTML/TXT e pipeline de exportação
    raster.ts        OffscreenCanvas e PNG no worker de exportação
    characters.ts    Catálogo de caracteres e calibração de cobertura de glifos
    masks.ts         Chroma key, movimento e reamostragem sem vazamento do fundo
    person.ts        Segmentação local de pessoas com MediaPipe CPU/WASM
    demo.ts          Arte procedural de abertura, sem recursos remotos
  hooks/             Relógio de reprodução e fila limitada a 3 frames
  types.ts           Contrato de mídia, configurações e API desktop
  App.tsx            Workspace e controles
tests/               Testes de conversão, segurança do texto e memória
```

FFmpeg roda em processos separados com duas threads por decoder. O renderer puxa frames RGB somente quando a fila tem espaço. O stream nativo aplica backpressure, o cache guarda apenas pixels e a fila limita a três frames. Cada worker recebe um buffer transferível; o segundo worker permite exportar enquanto a prévia continua. Exportações respeitam backpressure do encoder e do arquivo e não acumulam vídeos inteiros na RAM.

O relógio usa `requestAnimationFrame` e FPS racional informado pelo FFprobe. Vídeos com FPS variável são normalizados. Em máquinas lentas a prévia descarta frames vencidos para acompanhar o relógio; exportação conserva todos. O contador de FPS mede frames apresentados, o tempo de conversão mede o worker, e o cache informa só memória de pixels (não o uso total do processo). Limites de 300×160 células e 120 FPS de origem protegem a interface. A velocidade real depende do arquivo, resolução e hardware; não há garantia de 60 FPS para toda combinação.

## Segurança e expansão

Renderer sandboxed, isolamento de contexto, Node desativado e ponte IPC restrita. Identificadores aleatórios referenciam mídias já importadas; exportações só escrevem no destino selecionado pelo diálogo nativo. FFmpeg recebe argumentos em array, sem shell. HTML exportado escapa texto personalizado e protege o delimitador de script.

Pontos de expansão: decodificador por hardware, fila de exportações, áudio remuxado, exportação WebM, alpha na exportação, prévia original em resolução integral e perfis persistentes. Distribuidores devem revisar as licenças dos binários FFmpeg e codecs escolhidos antes de publicar instaladores.

Referências: [Electron / isolamento de contexto](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [xterm.js](https://xtermjs.org/docs/api/terminal/classes/terminal/), [FFmpeg](https://ffmpeg.org/ffmpeg.html).

## Feedback e condições de uso

Sugestões e relatos de erros são bem-vindos nas Issues. Inclua os passos para reproduzir, o comportamento esperado e o sistema utilizado; não envie mídias privadas, credenciais ou dados pessoais.

Uma licença aberta para o código do projeto ainda não foi escolhida. A publicação tem como finalidade apresentar o protótipo e receber feedback. Dependências e modelos mantêm suas próprias licenças.
