# agentic-media-kit (pt-BR)

**Deixe seu agente de código mostrar o próprio trabalho.** Ele abre o seu app rodando, grava o fluxo, transforma a gravação num Reel pronto pro Instagram e publica o resultado numa página privada que você abre no celular. Você não precisa encostar na máquina onde ele roda.

Funciona com Claude Code, Codex, T3 Code ou qualquer agente que rode shell. [English](README.md)

```
 CAPTURAR (agent-browser) ──▶ COMPOR (Remotion) ──▶ PUBLICAR (media-viewer no Railway) ──▶ celular
 screenshots + vídeo WebM      Reel / Feed / Story     página com senha + upload por token     assistir, baixar, postar
```

## O que tem aqui

- **`apps/media-viewer`**: app Express em um único arquivo, sem JS no cliente. Lista projetos (prefixos do bucket S3), toca vídeos e imagens via URLs pré-assinadas e tem botão de download de verdade. Pessoas entram com senha (cookie); agentes enviam arquivos com `Authorization: Bearer $UPLOAD_TOKEN`. Tem `/healthz`, Dockerfile e `railway.json`.
- **`apps/studio`**: template Remotion 4 com props tipadas em zod. Formatos Reel/Story 1080×1920, Feed 1080×1350, Quadrado 1080×1080, stills e capa. Inclui um "tour" que enquadra screenshots ou gravações de tela num mockup de celular ou navegador, com legendas. Tem também um vídeo de antes/depois (`BeforeAfter-Landscape` 1920×1080 e `BeforeAfter-Feed` 1080×1350) que rola duas versões de uma página lado a lado. Também traz uma UI demo gerada em React e uma página demo, então tudo renderiza sem nenhum asset.
- **`scripts/`**: `capture-flow.sh` (grava com agent-browser), `capture-before-after.sh` (captura de página inteira das duas versões para o antes/depois), `webm-to-mp4.sh` (gera MP4 seguro pro Instagram: H.264, yuv420p, AAC, faststart) e `upload.sh` (publica no viewer).
- **`.claude/skills/agentic-media`**: skill do Claude Code que roda o pipeline inteiro.

## Início rápido

```bash
npm install
cd apps/studio
npx remotion still Reel-Cover out/capa.png
npx remotion render Tour-Reel out/tour.mp4 --codec=h264 --pixel-format=yuv420p --audio-codec=aac

cd ../..
scripts/capture-flow.sh http://localhost:3000 apps/studio/public/captures mobile
export MEDIA_VIEWER_URL=https://seu-viewer.example.com UPLOAD_TOKEN=...
scripts/upload.sh meu-app apps/studio/out/tour.mp4
```

## Vídeos de antes/depois

Redesenhou uma página? O `BeforeAfter-Landscape` mostra a versão antiga e a nova lado a lado. As duas rolam em sincronia, seção por seção, com uma legenda para cada seção. Depois vêm as mesmas páginas no celular, um checklist opcional do que mudou e o encerramento.

```bash
scripts/capture-before-after.sh https://example.com http://localhost:3000 apps/studio/public/before-after/home both
cd apps/studio
npx remotion render BeforeAfter-Landscape out/antes-depois.mp4 --props=./ba.json --codec=h264 --pixel-format=yuv420p
npm run before-after        # demo incluída: uma landing page fictícia, antes e depois
```

Props, como os beats se ligam às seções, `CAPTURE_CSS` (headers fixos, banners) e `SECTION_SELECTOR`: [docs/before-after.md](docs/before-after.md) (em inglês).

## Deploy no Railway

O passo a passo completo está em [docs/deploy-railway.md](docs/deploy-railway.md). Em resumo: crie um projeto, um serviço com Root Directory `/apps/media-viewer`, um bucket (`railway bucket create media --region iad`) e passe as credenciais dele para as variáveis `BUCKET_*` (`BUCKET_NAME` é o `bucketName` das credenciais, não `media`). Defina também `AUTH_PASSWORD`, `SESSION_SECRET` e `UPLOAD_TOKEN`, configure o healthcheck `/healthz` no serviço (o Railway não aplica mais o bloco `deploy` do `railway.json`) e gere um domínio.

## Guias (em inglês)

[Captura](docs/capture-with-agent-browser.md) · [Antes/depois](docs/before-after.md) · [T3 Code](docs/t3-code.md) · [Instagram](docs/instagram.md) · [Railway](docs/deploy-railway.md) · [Fluxo remoto](docs/remote-workflow.md)

## Licença

O código deste repositório é MIT (veja [LICENSE](LICENSE)). O **Remotion tem licença própria**: é gratuito para pessoas físicas e times pequenos, e empresas acima do limite precisam de uma [licença de empresa](https://www.remotion.dev/license).

## Autor

**Renan Winter Spatin**, Arquiteto de Software e Estrategista de Tecnologia. [github.com/rwspatin](https://github.com/rwspatin)
