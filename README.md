# Cobrinha Arcade

Jogo estilo Snake para navegador feito com **HTML, CSS e JavaScript puros**, sem dependências de build, pronto para versionar no GitHub e publicar na Vercel como site estático.

**Criado por:** Vinícius

## Recursos

- **6 níveis progressivos** (5 níveis de campanha + Modo Infinito) centralizados em `LEVELS_CONFIG` dentro de `game-logic.js`, com aumento gradual de velocidade, pontos por fruta e obstáculos na arena.
- **Identificação do jogador** antes de iniciar a partida (com validação de nome).
- **Ranking persistente** ordenado por pontuação e salvo no `localStorage` do navegador.
- **Controles completos**: setas do teclado ou `WASD` no desktop, gestos de deslize (`swipe`) sobre o tabuleiro e botões direcionais na tela para celular.

## Arquivos principais

- `index.html`: estrutura da tela inicial, HUD, arena `<canvas>`, controles na tela e modais.
- `style.css`: estilos responsivos para desktop e dispositivos móveis.
- `game-logic.js`: configuração centralizada de níveis (`LEVELS_CONFIG`), regras de movimento, colisão, progressão e ranking.
- `script.js`: renderização em Canvas 2D, áudio sintético (Web Audio API) e gerenciamento de eventos.

## Como rodar localmente

Por usar módulos ES nativos (`<script type="module">`), sirva a pasta por HTTP local com qualquer servidor estático:

```bash
# Opção 1: Python
python3 -m http.server 3000

# Opção 2: Node.js
npx serve . -l 3000
```

Depois acesse `http://localhost:3000` no navegador.

## Como subir no GitHub

```bash
git init
git add index.html style.css game-logic.js script.js README.md
git commit -m "feat: jogo da cobrinha com niveis e ranking"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/cobrinha-arcade.git
git push -u origin main
```

## Como publicar na Vercel

1. Acesse [vercel.com](https://vercel.com) e importe o repositório do GitHub.
2. Em **Framework Preset**, selecione **Other** (sem framework).
3. Deixe **Build Command** vazio e **Output Directory** como `.` (raiz do projeto).
4. Clique em **Deploy**. A Vercel servirá os arquivos estáticos diretamente.
