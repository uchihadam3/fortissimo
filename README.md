# FORTÍSSIMO

**A sua defesa toca a música.**

*Uma produção Uchihadam Production.*

FORTÍSSIMO é um tower defense musical em 3D. A sua base é uma **tartaruga colossal** que caminha por
paisagens enormes carregando uma vila-orquestra no casco. O mundo foi tomado pelo **Silêncio**: tudo
está cinza e mudo, e criaturas de tinta com a boca tapada por um "X" atacam a tartaruga de todos os
lados. Nas placas hexagonais do casco você constrói **torres-instrumento**, e cada tiro delas é uma nota
da trilha sonora, no ritmo exato da música. Quanto mais você constrói, mais rica a música fica, e por
onde a tartaruga passa a cor volta ao mundo.

## Jogar

**Instalar (computador, Android e iPhone):** abra **https://uchihadam3.github.io/fortissimo/** e escolha
**Instalar o jogo** no menu. No Chrome e no Edge (computador ou Android) aparece o pedido de instalação;
no iPhone e no iPad, pelo Safari, toque em Compartilhar e depois em *Adicionar à Tela de Início*.
Instalado, o FORTÍSSIMO abre em tela cheia como um app, funciona sem internet e **se atualiza sozinho**:
cada envio para `main` publica uma versão nova e o jogo instalado a baixa na próxima vez que for aberto
com internet. O progresso nunca se perde numa atualização.

**Offline, sem instalar nada:** baixe o arquivo [`jogar/FORTISSIMO.html`](jogar/FORTISSIMO.html) e abra
com dois cliques (Chrome, Edge ou Firefox recentes). O jogo inteiro está nesse único arquivo: código,
música, sons, fontes e imagens.

**Publicação:** o GitHub Pages precisa estar ligado uma vez (*Settings → Pages → Source: GitHub
Actions*). Depois disso, cada envio para `main` testa, gera e publica o jogo automaticamente.

## Como se joga

- **A viagem:** cada fase é uma jornada de 3 a 5 minutos até um marco no horizonte (um sino gigante,
  uma harpa dourada, um órgão de cristal…). Toque em ▶ e a tartaruga parte, **um passo por batida**.
  Chegou com vida, venceu.
- **Construir:** toque numa placa brilhante do casco e escolha um instrumento no menu circular. Toque
  numa torre para **evoluir** (3 níveis) ou **vender**.
- **Os inimigos** saem da névoa cinza pela frente, pelos lados, por trás e pelo céu. Setas na borda da
  tela mostram de onde vem a próxima onda e quais criaturas.
- **Notas douradas** flutuam pela paisagem: toque nelas para coletar antes que fiquem para trás.
- **FORTÍSSIMO (ff):** a barra enche com os acertos. Ao soltar, a música faz um crescendo e a tartaruga
  dá uma **pisada gigante** no tempo forte.
- **Estrelas:** 3 se perder no máximo 2 vidas, 2 até a metade, 1 se chegar com qualquer vida.

### Torres (instrumentos)

| Torre | O que faz |
|---|---|
| Harpa | tiros rápidos de notas, acerta chão e ar |
| Tambor | morteiro com explosão em área (só chão) |
| Sino | desacelera tudo em volta e revela invisíveis |
| Chocalho | gera notas (dinheiro) a cada compasso |
| Cristal | raio que salta entre inimigos |
| Trompa | onda sonora que atravessa uma linha inteira |
| Coral | aumenta o dano das torres vizinhas e revela invisíveis |
| Grave | golpe enorme que ignora armadura (só chão) |

### Controles

| Ação | Mouse e teclado | Toque |
|---|---|---|
| Construir / evoluir | clique na placa ou na torre | tocar |
| Girar a câmera | arrastar | arrastar |
| Zoom | roda do mouse | pinça |
| Partir | Espaço ou ▶ | ▶ |
| FORTÍSSIMO | F | botão "ff" |
| Pausa | Esc ou P | botão ‖ |
| Recentrar câmera | R ou duplo clique | duplo toque |

## O mundo

Cinco terras, quatro jornadas em cada uma (a quarta é o guardião da terra), com um **caminho extra**
mais difícil em cada terra e **O Abismo**, o desafio secreto depois do final:

1. **Prado das Cantigas**: harpa, tambor, sino e o Grande Borrão
2. **Dunas do Eco**: chocalho, cristal, obeliscos mudos e o Escaravelho
3. **Picos de Cristal**: trompa, coral e a Mariposa-Rainha
4. **Forja do Trovão**: grave e o Golem da Forja
5. **Cidadela do Silêncio**: todos os instrumentos contra o próprio Silêncio

Toda fase vencida libera o desafio **Virtuoso** (criaturas bem mais fortes, coroa dourada). Ao vencer o
guardião de uma terra, abre o **Bis**, uma viagem sem fim para bater recorde.

O jogo salva sozinho ao fim de cada jornada, em 3 espaços. Em **Carregar**, cada jornada pode ser
exportada como código ou arquivo e importada em outro aparelho.

## Desenvolvimento

```bash
npm install
```

```bash
npm run dev
```

Depois abra o endereço que aparecer (normalmente `http://localhost:5173`).

```bash
npm test
```

```bash
npm run build
```

O build gera `dist/index.html`, um arquivo único com tudo dentro (código, fontes e imagens). Os arquivos
de `public/` e o `sw.js` tornam a versão publicada instalável e autoatualizável. `npm run offline` gera o
build e atualiza a cópia offline em `jogar/FORTISSIMO.html`.

```bash
npm run balance
```

Esse comando joga todas as fases com um robô e mostra o resultado de cada uma (vitória, vidas, estrelas).
Ele é usado para equilibrar a dificuldade.

- `src/sim/`: a simulação (pura, determinística): `journey.ts` (a viagem), `defs.ts` (torres e
  criaturas), `shell.ts` (as placas do casco), `path.ts` (a estrada).
- `src/data/campaign.ts`: as 25 jornadas, o mapa e o modo Bis.
- `src/view/`: o mundo 3D: paisagem, céu pintado, grama, a tartaruga, torres, criaturas, efeitos e a
  cor que volta.
- `src/audio/`: música e sons 100% sintetizados com Web Audio. Cada tiro de torre é uma nota da trilha.
- `src/game/`: o jogo: batalha, tutorial sem palavras, cenas, menus e fluxo.
- `src/ui/`: interface, ícones em SVG, logo.

Feito com Three.js, Web Audio e TypeScript.

---

© 2026 Uchihadam Production. Mundo, personagens, regras, música e arte são originais.
