# FORTÍSSIMO — documento de design

*Uchihadam Production.* Tower defense musical em 3D. **A sua defesa toca a música.**

## A ideia

A base do jogador é uma **tartaruga colossal**, gentil e viva, que caminha por paisagens enormes
carregando uma vila-orquestra no casco. Cada fase é uma **viagem** de 3 a 5 minutos até um marco no
horizonte. O mundo foi tomado pelo **Silêncio**: está cinza e mudo, e criaturas de tinta com a boca
tapada por um "X" saem da paisagem (frente, flancos, retaguarda e céu) para morder a tartaruga.

Nas **placas hexagonais do casco** o jogador constrói **torres-instrumento**. Todas disparam no tempo
da música, em semicolcheias, e **cada disparo é uma nota da trilha**. Quanto mais torres, mais rica a
música. A tartaruga dá **um passo por batida** (o bumbo da música é o passo dela). Por onde ela passa,
a cor volta ao mundo.

## O que é novo

1. **Uma base que anda:** não existe estradinha. Os inimigos vêm da paisagem e as direções mudam com o
   terreno (cânions, rios, lagos, florestas, ruínas). A posição de cada torre no casco importa: frente,
   flancos, retaguarda, ou as placas altas do centro, que alcançam mais longe.
2. **Combate quantizado na música:** torres atiram em padrões rítmicos e projéteis voam um número exato
   de semicolcheias. Até os impactos caem no ritmo. O mundo inteiro pulsa na batida.
3. **A trilha é gerada pela batalha:** o fundo musical (bateria/passos, baixo, pads) sobe de intensidade
   com o perigo; as melodias são tocadas pelas próprias torres.
4. **A cor volta com a música:** o mundo cinza ganha cor em volta da tartaruga e no rastro dela; ao
   chegar, o marco toca e uma onda de cor varre a terra inteira.
5. **FORTÍSSIMO (ff):** a barra enche com os acertos; ao soltar, a música faz um crescendo e a tartaruga
   dá uma pisada gigante exatamente no tempo forte.
6. **Notas para colher:** notas douradas flutuam na paisagem; tocar nelas dá dinheiro, e o que não for
   colhido fica para trás.

## Ensinar sem texto

Nenhum texto explica regras. Uma luvinha branca aponta a única coisa a fazer (a primeira placa, o
instrumento, o botão ▶, a primeira nota dourada, a torre que já pode evoluir, o botão ff). Inimigos novos
aparecem num cartão com retrato e ícones (asa = voa, olho riscado = invisível, escudo, armadura, divide,
silencia, cura). Setas na borda mostram de onde vem cada onda. Cada fase apresenta **uma** novidade.

## História (sem palavras)

Abertura: o mundo feliz, a vila no casco, o Maestro (um personagenzinho redondo de fraque e batuta)
regendo ao lado do Coração de cristal. O Silêncio surge no horizonte, uma onda cinza apaga cor e som,
a tartaruga adormece. Resta uma única nota na ponta da batuta: o Maestro a ergue, um círculo de cor
nasce, a tartaruga acorda e dá o primeiro passo. Título.

Cinco terras: **Prado das Cantigas**, **Dunas do Eco**, **Picos de Cristal**, **Forja do Trovão** e
**Cidadela do Silêncio**. Cada uma termina com um guardião: o Grande Borrão, o Escaravelho (se enterra),
a Mariposa-Rainha (congela torres), o Golem da Forja (perde as placas de armadura) e o Silêncio (flutua
fora de alcance da mordida, invoca criaturas e lança ondas de silêncio).

Final: o Silêncio cai e encolhe; é pequeno e sozinho, nunca teve música própria. O Maestro não o
destrói: rege uma **pausa**, um compasso inteiro de silêncio verdadeiro, e o Silêncio entende que é parte
da música. O manto dele vira as estrelas da noite, o mundo floresce, o Maestro se curva. Créditos.

## Torres

| Torre | Papel | Ritmo (nível 1) |
|---|---|---|
| Harpa | tiro rápido, chão e ar | semínimas → colcheias |
| Tambor | morteiro com área, só chão | tempos 1 e 3 |
| Sino | desacelera e revela invisíveis | cabeça do compasso |
| Chocalho | economia (notas por compasso) | contratempos |
| Cristal | raio em cadeia | rajadas |
| Trompa | onda que atravessa uma linha, longo alcance | a cada 2 compassos |
| Coral | +dano às torres vizinhas, revela invisíveis | acordes |
| Grave | dano enorme, ignora armadura, só chão | a cada 2 compassos |

## Estrutura

- 20 jornadas no caminho principal (4 por terra; a 4ª é o guardião).
- 5 caminhos extras (um por terra), liberados por estrelas, bem mais difíceis.
- **O Abismo**: desafio secreto depois do final.
- **Virtuoso** em toda jornada vencida (criaturas mais fortes e rápidas, só 10 vidas; coroa dourada).
- **Bis**: viagem sem fim por terra, liberada ao vencer o guardião.
- Estrelas: 3 (perdeu no máximo 10% das vidas), 2 (até 50%), 1 (chegou).

O equilíbrio é verificado com `npm run balance`, que joga todas as fases com um robô.
