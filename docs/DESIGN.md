# FORTÍSSIMO — documento de design

*Uchihadam Production.* Tower defense musical em 3D. **A sua defesa toca a música.**

## A ideia em uma frase

Cada torre é um instrumento. Todas as torres disparam no tempo da música (em semicolcheias), e cada
disparo **é uma nota** da trilha: quanto mais torres e mais inimigos, mais rica a música fica. Os
inimigos são criaturas do **Silêncio**, que roubou a música do mundo; derrotá-los solta as notas
roubadas (as moedas), que voam até o seu contador tocando arpejos. Cada fase começa cinza e quase
muda; conforme você defende, a cor volta ao mapa. No fim da fase o lugar floresce.

## O que é novo

1. **Combate quantizado na música** — torres atiram em padrões rítmicos (harpa em colcheias, tambor
   nos tempos 1 e 3, sino na cabeça do compasso…), projéteis têm tempo de voo de um número exato de
   semicolcheias, então até os impactos caem no ritmo. O mundo inteiro pulsa na batida.
2. **A trilha é gerada pela batalha** — o fundo musical (bateria, baixo, pads) sobe de intensidade
   com as ondas; as melodias são tocadas pelas próprias torres.
3. **A cor volta com a música** — a saturação do mundo é o seu progresso dentro da fase.
4. **FORTÍSSIMO (ff)** — o poder do Maestro: a barra enche com acertos; ao soltar, a música faz um
   compasso de *build-up* e um *drop* exatamente no tempo forte, com onda de choque em tudo.
5. **Desvios (mundo 2+)** — alavancas nas bifurcações mudam a rota dos inimigos.

## Ensinar sem texto

Nenhum texto explica regras. Ensinamos com: um bloco de construção que pulsa e uma mãozinha que
aponta (só na primeira vez), um menu radial com o único ícone possível, o botão ▶ pulsando, o
contorno de alcance ao escolher torres, cartões com retrato 3D + ícones quando aparece um inimigo
novo (asa = voa, olho riscado = invisível, escudo, etc.), números de preço que ficam vermelhos quando
falta dinheiro. Cada fase apresenta **uma** coisa nova.

## História (sem palavras)

Harmonia é um mundo onde tudo vive de música. No centro, o **Coração** (uma caixa de música de
cristal) mantém a canção do mundo, regida pelo **Maestro** (um personagenzinho redondo de fraque e
batuta). O **Silêncio** — um manto cinza, enorme, sem rosto — chega do horizonte, apaga cor e som e
estilhaça o Coração; os cinco fragmentos voam para cinco terras. Sobrou uma única nota na ponta da
batuta. O Maestro ergue a primeira torre.

Cinco terras: **Prado das Cantigas** (campos, moinhos, rio), **Dunas do Eco** (cânions, ruínas,
oásis), **Picos de Cristal** (neve, gelo, aurora), **Forja do Trovão** (vulcão, lava, bigornas),
**Cidadela do Silêncio** (mármore cinza flutuando no vazio). Cada terra termina com um chefe; vencer
devolve um fragmento ao Coração.

Final: o Silêncio cai e encolhe — é pequeno e solitário; nunca teve música própria. O Maestro não o
destrói: rege uma **pausa** — o mundo inteiro silencia por um compasso — e o Silêncio entende que é
parte da música (as pausas entre as notas). Ele vira a noite estrelada; o mundo floresce; aplausos;
créditos.

## Torres (instrumentos)

| Torre | Instrumento | Papel | Ritmo (nível 1) |
|---|---|---|---|
| Harpa | harpa dedilhada | tiro rápido, ar e chão | semínimas → colcheias |
| Tambor | tambor de guerra | morteiro com área, só chão | tempos 1 e 3 |
| Sino | sino | desacelera + revela invisíveis | cabeça do compasso |
| Chocalho | chocalho/ganzá | economia: gera notas (moedas) | contratempos |
| Cristal | sintetizador | raio em cadeia | rajadas |
| Trompa | metais | onda sonora que atravessa em linha, longo alcance | a cada 2 compassos |
| Coral | coro | suporte: +dano para torres próximas, revela invisíveis | acordes |
| Grave | sub-grave | dano enorme, perfura armadura, só chão | a cada 2 compassos |

## Inimigos (criaturas do Silêncio)

Borrão (básico), Borrãozinho (filhote), Ligeiro (rápido), Casco (blindado), Mariposa (voa),
Escudeiro (escudo que protege vizinhos), Bolha (divide-se), Fantasma (invisível), Abafador (silencia
torres próximas), Curandeiro (cura vizinhos). Chefes: Grande Borrão, Escaravelho, Mariposa-Rainha,
Golem da Forja, O Silêncio.

## Estrutura

- Caminho principal: 5 terras × 4 fases (a 4ª é o chefe) = 20 fases.
- Caminhos extras: 1–2 fases bônus por terra, ramificando do caminho principal, mais difíceis.
- Desafio **Virtuoso** em toda fase vencida (inimigos bem mais fortes, coroa dourada).
- **Bis** (modo sem fim) por terra, liberado ao vencer a terra.
- Estrelas: 3 (≥18 vidas), 2 (≥10), 1 (venceu).
- Partidas de 3 a 6 minutos. Ondas podem ser chamadas mais cedo (bônus de moedas).

## Música

Cada terra tem um tema de batalha (mesma pulsação do começo ao fim da fase) com 4 intensidades. O
fundo deixa espaço no médio-agudo para as torres. A harmonia de cada compasso é determinística, para
que as notas das torres sempre caiam em tons do acorde. Tema principal (leitmotiv) no menu, no mapa,
na abertura e no final.
