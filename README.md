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

- **A viagem:** cada fase é uma jornada de 4 a 10 minutos até um marco no horizonte (um sino gigante,
  uma harpa dourada, um órgão de cristal…), dividida em **movimentos**, como uma sinfonia. Toque em ▶ e a
  tartaruga parte, **um passo por batida**. Chegou com vida, venceu.
- **Respiros:** entre um movimento e outro a música acalma, aparecem notas douradas na estrada e **mais
  uma placa do casco acende**: a banda cresce durante a fase.
- **Montar a banda:** toque numa placa brilhante do casco e escolha um músico no menu circular. Cada torre
  é um músico tocando o seu instrumento. Toque numa torre para **evoluir** (3 níveis) ou **vender**.
- **Harmonia:** cada naipe diferente na banda (cordas, percussão, sinos, metais, vozes, graves) deixa a
  música mais rica **e** todos os músicos mais fortes (luzinhas de harmonia no topo da tela).
- **Duetos:** dois músicos certos lado a lado formam um dueto (um arco de luz os une): harpa + tambor
  tocam juntos, sino + cristal congelam, tambor + grave fazem as criaturas tropeçarem, coral + sino curam
  a tartaruga… No menu circular, o instrumento que formaria um dueto brilha.
- **Desafio:** cada terra tem criaturas que exigem uma banda variada (as que voam, as blindadas, as
  invisíveis, o redemoinho que desvia tiros, a Sombra que cala um instrumento inteiro…).
- **Recomeçar do movimento:** perdeu? Dá para voltar do começo do movimento em que caiu.
- **Os inimigos** saem da névoa cinza pela frente, pelos lados, por trás e pelo céu. Setas na borda da
  tela mostram de onde vem a próxima onda e quais criaturas.
- **Notas douradas** flutuam pela paisagem: toque nelas para coletar antes que fiquem para trás.
- **A batuta (você rege):** o botão da batuta, no canto de baixo à esquerda, pulsa a cada batida
  (um anel se fecha sobre ele no tempo). Toque **no tempo** e você toca percussão junto com a banda.
  Acertos seguidos sobem o **groove** (0 a 4: 4, 12, 24 e 40 acertos): a banda bate mais forte (até
  +30% no groove 4, quando tudo explode em luz), o ff enche mais rápido e a tartaruga pisa mais firme.
  Um erro derruba um nível; dois compassos sem tocar e o groove esfria devagar. A partir do groove 3
  as colcheias também valem.
- **Solos:** cada músico carrega um solo enquanto toca (mais rápido com groove). Quando ele brilha no
  casco, toque nele **no tempo**: um compasso de ataque especial (harpa: rajada; tambor: onda de choque
  que empurra; sino: grande badalada que freia tudo; chocalho: chuva de notas; cristal: tempestade de
  raios; trompa: sopro que atravessa até redemoinho; coral: a banda inteira mais forte e nada fica
  invisível; grave: pancadas enormes no chão). No tempo perfeito o solo é mais forte. Fora do tempo,
  o toque abre o menu do músico, como sempre.
- **O eco do Maestro:** nos respiros o Maestro toca uma frase de 4 notas (as bolinhas acendem sobre a
  batuta). No compasso seguinte, repita na batuta. Acertou: notas douradas de bônus, +1 de groove e um
  **acorde** que atinge todas as criaturas no começo do próximo movimento. As frases ficam mais
  sincopadas nas terras mais distantes.
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
| Partir | Enter ou ▶ | ▶ |
| Batuta (no tempo) | Espaço ou J | botão da batuta |
| Solo | clique no músico que brilha, no tempo | tocar no músico, no tempo |
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

Toda fase vencida libera o desafio **Virtuoso** (metade das vidas e menos notas no começo; coroa dourada). Ao vencer o
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

Esse comando joga todas as fases com robôs e mostra o resultado de cada uma (vitória, vidas, estrelas):
o *regente* (constrói bem e mantém o ritmo como um jogador razoável, groove ≈ 2), o *trêmulo* (ritmo
fraco), o *bom* sem ritmo nenhum, o *novato* e a banda de um instrumento só. Ele é usado para equilibrar
a dificuldade.

- `src/sim/`: a simulação (pura, determinística): `journey.ts` (a viagem), `defs.ts` (torres e
  criaturas), `rhythm.ts` (groove, julgamento do toque, frases do Maestro), `shell.ts` (as placas do casco), `path.ts` (a estrada).
- `src/data/campaign.ts`: as 25 jornadas, o mapa e o modo Bis.
- `src/view/`: o mundo 3D: paisagem, céu pintado, grama, a tartaruga, torres, criaturas, efeitos e a
  cor que volta.
- `src/audio/`: música e sons 100% sintetizados com Web Audio. Cada tiro de torre é uma nota da trilha.
- `src/game/`: o jogo: batalha, tutorial sem palavras, cenas, menus e fluxo.
- `src/ui/`: interface, ícones em SVG, logo.

Feito com Three.js, Web Audio e TypeScript.

---

© 2026 Uchihadam Production. Mundo, personagens, regras, música e arte são originais.
