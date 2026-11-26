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
- **Tudo no ritmo:** o FORTÍSSIMO é um jogo de ritmo. Cada toque é julgado contra a batida que você
  ouve: perfeito (✦ dourado), bom (✓ branco) ou erro (✕ vermelho). Vale para a batuta, para qualquer
  lugar vazio da tela, para as notas douradas, para as criaturas e para os músicos que brilham.
- **A força (o medidor ao lado da batuta):** cada acerto enche a barra (o perfeito enche mais, e a
  sequência, o número grande, faz encher ainda mais rápido); cada erro tira um pedaço, a barra pisca
  vermelha e a sequência volta a zero. Parou de tocar, a força esvazia devagar. Quanto mais cheia,
  mais forte a banda (o número ×1,00 até ×1,60 é o dano de todos os músicos), mais rápido enchem o ff e
  os solos, mais os músicos brilham e mais grandiosa fica a música (as faixas da barra são as camadas
  da música).
- **A batuta:** o botão no canto de baixo à esquerda pulsa a cada batida: um anel se fecha sobre ele e
  fica **dourado** no instante perfeito. Tocar num lugar vazio da tela também vale como batuta.
- **Notas douradas no ritmo:** elas pulsam a cada batida (mais forte no primeiro tempo do compasso).
  Tocadas no tempo valem mais (perfeito: ×1,5) e cada nota seguida no tempo toca a próxima nota de uma
  melodia; fora do tempo você pega só metade e conta como erro.
- **A batida nas criaturas:** toque numa criatura no tempo e a tartaruga a atinge com um raio de luz
  (mais forte com a força cheia, e a empurra para trás). Cada criatura só pode ser atingida de novo
  depois de dois compassos; fora do tempo é só um zumbido e conta como erro.
- **Solos:** cada músico carrega um solo enquanto toca (muito mais rápido com a força alta). Quando ele
  brilha no casco, tocar nele **sempre** dispara o solo: no tempo com força total (perfeito ainda mais
  forte), fora do tempo mais fraco e contando como erro. Um músico que não brilha abre o menu dele
  (evoluir ou vender; no nível máximo só aparece a coroa e vender). Os solos: harpa, rajada; tambor,
  onda de choque que empurra; sino, grande badalada que freia tudo; chocalho, chuva de notas; cristal,
  tempestade de raios; trompa, sopro que atravessa até redemoinho; coral, a banda inteira mais forte e
  nada fica invisível; grave, pancadas enormes no chão.
- **Crescendo:** cada movimento tocado com a força média alta acende uma estrela de crescendo (ao lado
  da barra): a banda fica um pouco mais forte até o fim da viagem e a força nunca mais esvazia abaixo
  dela. No fim da viagem aparecem a sua precisão (%), a maior sequência e as estrelas de crescendo.
- **Os chefes (duelo no ritmo):** toda fase termina com um **sub-chefe** perto do sino (o Sapo-Borrão,
  o Besouro-Bumbo, o Corvo-Cinza, o Verme-das-Dunas…), as fases de guardião trazem dois sub-chefes no
  meio da luta e o guardião no fim, e os caminhos extras terminam com uma **lenda** (a Serpente-Vagalume,
  o Gênio da Miragem, o Dragão da Aurora, a Fênix Negra e o Rei do Abismo). Cada chefe tem a sua
  música, o seu nome e uma barra de vida com as marcas das fases (2 nos sub-chefes, 3 nos guardiões e
  nas lendas). O chefe **ataca no tempo**: ele se prepara e um **anel vermelho** se fecha sobre a batuta
  (com uma bolinha vermelha para cada golpe que vem); os cantores e as lendas tocam o ritmo dos golpes
  um compasso antes, como uma chamada. Toque (na batuta, num lugar vazio ou no próprio chefe) **no
  tempo em que o golpe cai**: perfeito **devolve** o golpe (dano e o chefe cambaleia), bom **bloqueia**.
  Golpe que passa tira vidas, cala um músico por dois compassos e derruba a força, mas com a força alta
  a tartaruga fica dentro de um **escudo de som dourado** que absorve boa parte do golpe (com a barra
  cheia, ele quica e não tira vida nenhuma). Sequências longas deixam a janela do tempo um pouco maior.
- **O eco do Maestro:** nos respiros o Maestro toca uma frase de 4 notas (as bolinhas acendem sobre a
  batuta). No compasso seguinte, repita na batuta. Cada nota conta na força. Acertou: notas douradas de bônus e um
  **acorde** que atinge todas as criaturas no começo do próximo movimento. As frases ficam mais
  sincopadas nas terras mais distantes.
- **FORTÍSSIMO (ff):** a barra enche com os acertos. Ao soltar, a música faz um crescendo e a tartaruga
  dá uma **pisada gigante** no tempo forte.
- **Estrelas:** 1 por chegar; 2 se perder no máximo metade das vidas; 3 se perder no máximo 2 vidas
  **e** tocar no ritmo (pelo menos 85% de acertos, com mais ou menos um toque por compasso).

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
| Batuta (no tempo) | Espaço, J ou clique num lugar vazio | botão da batuta ou toque num lugar vazio |
| Nota dourada / criatura | clique nela, no tempo | tocar, no tempo |
| Solo | clique no músico que brilha, no tempo | tocar no músico que brilha, no tempo |
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
o *virtuose* (quase todo toque perfeito), o *regente* (constrói bem e mantém o ritmo como um jogador
razoável, força ≈ 60), o *trêmulo* (ritmo fraco), o *bom* sem ritmo nenhum, o *novato* (ritmo fraco) e a
banda de um instrumento só. Ele é usado para equilibrar
a dificuldade.

- `src/sim/`: a simulação (pura, determinística): `journey.ts` (a viagem), `defs.ts` (torres e
  criaturas), `rhythm.ts` (a força, o julgamento do toque, as frases do Maestro), `shell.ts` (as placas do casco), `path.ts` (a estrada).
- `src/data/campaign.ts`: as 25 jornadas, o mapa e o modo Bis.
- `src/view/`: o mundo 3D: paisagem, céu pintado, grama, a tartaruga, torres, criaturas, efeitos e a
  cor que volta.
- `src/audio/`: música e sons 100% sintetizados com Web Audio. Cada tiro de torre é uma nota da trilha.
- `src/game/`: o jogo: batalha, tutorial sem palavras, cenas, menus e fluxo.
- `src/ui/`: interface, ícones em SVG, logo.

Feito com Three.js, Web Audio e TypeScript.

---

© 2026 Uchihadam Production. Mundo, personagens, regras, música e arte são originais.
