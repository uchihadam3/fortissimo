# FORTÍSSIMO — a história

Tudo é contado **sem palavras**: imagem, música e gesto. Só aparecem nomes de capítulos e de lugares.
O jogador descobre a história jogando: cada fase vencida termina com um **interlúdio** curto (12 a 20 s)
em que alguma coisa acontece, e cada terra nova começa com uma **abertura de capítulo**. As cenas usam a
linguagem do cinema: planos variados (gerais, closes, contra-plongée, por cima do ombro, travellings, gruas),
cortes no tempo da música, tarja de cinema, e podem ser puladas segurando o toque.

---

## O mundo: Harmonia

Harmonia é um mundo que foi **cantado**. Rios, ventos e flores são música tocando. A canção do mundo
é sustentada por **cinco Grandes Vozes**, uma em cada terra:

| Terra | A Voz (o marco no fim da estrada) | O que ela dá ao mundo |
|---|---|---|
| Prado das Cantigas | **o Sino do Prado**, um sino gigante numa colina | o **ritmo** (o tempo do mundo) |
| Dunas do Eco | **a Harpa das Dunas**, uma harpa dourada do tamanho de um morro, de cordas de luz | a **melodia** |
| Picos de Cristal | **o Órgão de Cristal**, tubos de gelo que cantam com a aurora | a **harmonia** |
| Forja do Trovão | **o Carrilhão da Forja**, bigornas-sino que o vulcão faz soar | o **timbre** (a força) |
| Cidadela do Silêncio | **a Agulha**, a torre de onde a canção era regida | a **pausa** (o respiro entre as notas) |

No alto do casco da Grande Tartaruga pulsa o **Coração da Canção**, um cristal que afina as cinco Vozes.

**Por que a viagem existe:** todo ano a Grande Tartaruga faz a **Grande Turnê**. Ela percorre a Estrada
da Canção visitando as cinco Vozes, levando nas costas a **Vila-Orquestra**, e em cada Voz a banda toca
para afinar o mundo por mais um ano. É uma tradição tão antiga quanto o mundo.

## O elenco

- **A Grande Tartaruga** (nos créditos: *Vovó Tuba*): colossal, velhíssima, sonolenta e gentil. Dá um
  passo a cada batida da música. Quando a banda toca bem, ela anda mais firme e os olhos brilham.
- **O Maestro**: pequeno, redondo, de fraque e batuta. Corajoso e um pouco atrapalhado. Lidera a vila.
- **Lira, a aprendiz** (harpa): miudinha, tímida, verde, com uma folha na cabeça. É a única musicista
  que sobra ao lado do Maestro depois do ataque. A primeira torre do jogo é ela.
- **Os músicos espalhados** (cada torre é um músico resgatado no caminho):

| Músico | Instrumento | Onde é encontrado (e como) | Entra na banda |
|---|---|---|---|
| **Bumbo** | tambor | estátua cinzenta numa praça de aldeia, no meio de uma batida | depois da fase 1 |
| **Dona Badalo** (coruja-avó de óculos) | sino | presa numa gaiola de espinhos de tinta, num campanário | depois da fase 2 |
| **Chocalho** | chocalho | enterrado até o pescoço nas dunas, sacudindo um chocalho sem som | abertura das Dunas |
| **Cristalina** | cristal | aprisionada dentro de um cristal cinza, no oásis | depois de Areias que Cantam |
| **Trompa** (ave peluda de gorro) | trompa | congelado num bloco de gelo no passo da montanha | abertura dos Picos |
| **Os Coralitos** (três filhotes) | coral | congelados num galho, de bico fechado | depois de Neve que Ecoa |
| **Grave** (grandalhão de cartola) | grave | acorrentado a uma carroça de pedras, obrigado a trabalhar para o Golem | abertura da Forja |

Todos os músicos são **pássaros-nota**, a mesma espécie do Maestro: redondos, de olhos grandes, cada um
com sua cor, chapéu e jeito. No casco, **cada torre mostra o músico tocando o seu instrumento**. Construir
torres é literalmente **montar a banda**. Nas cenas, cada músico tem o seu lugar no casco, em volta do Coração,
virado para fora como num coreto (a ordem da banda é a ordem dos resgates).

- **A vila**: passarinhos-nota pequenos, de chapeuzinho, que moram nas casinhas do casco e dançam nas festas
  (e se escondem quando o Silêncio chega).

- **O Silêncio**: alto como uma montanha, feito de tinta escura e tecido rasgado que ondula como fumaça.
  Usa uma **máscara de porcelana rachada** cuja boca é **costurada com um X**. Tem mãos longas e finas, e em
  volta da cabeça flutuam **cinco linhas de pauta partidas**, como uma coroa quebrada. Onde ele passa, a cor
  e o som somem.

## O que aconteceu (a abertura, ≈ 2 min)

A abertura é contada em quatro atos, com cortes no ritmo da música (`src/game/cutscenes.ts`, `openingScript`).

**I. Harmonia**
1. **Amanhecer.** Céu de aurora, ar limpo. As cinco Vozes ao longe (o Sino num morro, a Harpa, o Órgão, o
   Carrilhão, a Agulha), cada uma ligada ao Coração da tartaruga por um **fio de luz** da cor da sua terra.
   A câmera desce do alto até a Grande Tartaruga, onde os cinco fios se encontram.
2. **O Coração** inteiro: cinco facetas acesas, pulsando no tempo.
3. **O Maestro** ergue a batuta; a banda se prepara.
4. **A festa.** A banda inteira (os oito músicos) toca no casco, a vila dança entre as casinhas, pétalas.
   A câmera gira em volta do casco.
5. **A banda, um por um**, em cortes no tempo forte: Bumbo, Lira, Dona Badalo, Chocalho, Cristalina, Trompa,
   os Coralitos, Grave (o jogador conhece a banda completa que vai precisar reconstruir).
6. **Alegria**: rente ao chão, a tartaruga passa pelas flores, notas subindo do casco.

**II. O Silêncio**
7. **A sombra.** O céu escurece, a luz esfria. Os músicos param um a um e se viram para o horizonte; a vila
   para de dançar; a tartaruga para de andar. Uma **muralha de tinta** começa a ferver no horizonte.
8. **Por cima do ombro do Maestro**: algo sobe da muralha. Ele aponta.
9. **A subida**: rente ao chão, ao lado da cabeça da tartaruga, o Silêncio se ergue, do tamanho de uma
   montanha; o chão treme. O cinza vem do horizonte e vai fechando o mundo; só resta um anel de cor em volta
   da tartaruga. A cada deslizar do gigante para mais perto: tremor e um pulso escuro.
10. **A máscara**: teleobjetiva, empurrando até a máscara rachada de boca costurada.
11. **O rosto do Maestro**: um instante de pavor.
12. **A mão**: do casco, olhando para cima; a sombra da mão apaga a luz da tartaruga.
13. **O roubo**: ele fecha o punho e a música é arrancada do mundo — rios de notas douradas saem dos músicos,
    das flores e do chão e voam para o punho; a cor vai embora; os fios de luz se apagam.
14. **O Coração racha** (facetas piscando) e **se parte**: clarão branco, onda de choque.
15. **Os cinco fragmentos** voam para as cinco terras. A câmera persegue o verde por cima do prado até o
    Sino: o fragmento cai na tinta, a tinta sobe e **se enrola no Sino** — nasce o Grande Borrão, o guardião.
16. **A rajada cinza** varre o casco: os músicos são levados como folhas, rodopiando para longe, cada um para
    um lado. A vila se esconde. Lira se agarra ao pedestal e se esconde atrás dele. O Maestro cai de costas.

**III. Cinza**
17. Plano parado, alto: tudo cinza e mudo, cinzas caindo; o Silêncio e a muralha se desfazem na névoa; a
    tartaruga deita e fecha os olhos.
18. O Maestro se levanta e anda, triste, em volta do Coração vazio.

**IV. Esperança**
19. Atrás do pedestal, **Lira**, tremendo. Eles se olham.
20. **A última nota**: o Maestro ergue a batuta; na ponta ainda brilha uma nota, que sobe.
21. Lira **toca uma corda**. A nota responde; nasce um **círculo de cor** que se espalha pelo casco e pelo chão;
    no Coração reaparecem as cinco facetas, apagadas (o que falta recuperar).
22. **O olho** da tartaruga se abre (bem de perto).
23. **O primeiro passo**: rente ao chão, a pata pisa, flores brotam.
24. A câmera sobe; a tartaruga segue pelo mundo cinza com um pequeno círculo de cor. Título: **FORTÍSSIMO**.

**O objetivo, sem nenhuma palavra:** recuperar os cinco fragmentos, resgatar os músicos e fazer cada Voz
cantar de novo.

## As criaturas do Silêncio: sons roubados

Toda criatura do Silêncio é **um som que ele roubou e transformou em tinta**. Todas têm a boca costurada
com um X. Quando derrotadas, voltam a ser **notas douradas** (é por isso que deixam notas para a banda). Cada
terra tem a sua família, nascida dos sons daquela terra:

**Prado (sons do campo)**
- **Borrão**: gota de tinta que pula no ritmo; o som de passos.
- **Corredor**: ratinho de tinta rapidíssimo; o som de risadas de criança.
- **Bolhão**: bolha que estoura em borrinhos; o som de uma bolha de sabão.
- **Mariposa**: voa; o som do vento nas flores. Só harpa, sino, cristal e coral alcançam o céu.

**Dunas (ecos)**
- **Escorpião-de-Areia**: carapaça grossa; enterra-se e fica intocável por um instante.
- **Redemoinho**: um pequeno tornado de areia que **desvia tiros diretos** (harpa e trompa passam reto);
  só explosões, raios e sinos o pegam. Empurra quem está perto para a frente.
- **Eco**: ao ser derrotado, **volta uma vez**, mais fraco, um compasso depois.
- **Obelisco Mudo**: estrutura que cala as torres perto dela até ser derrubada.

**Picos (frio)**
- **Lobo-de-Geada**: vem em matilha, muito rápido, pouca vida.
- **Casco**: besouro de gelo blindado e lento; o grave e o sino atravessam a armadura.
- **Fantasma**: invisível na névoa até um sino ou o coral revelar.
- **Abafador**: coruja de neve com protetores de ouvido; **cala as torres** em volta enquanto vive.

**Forja (fogo)**
- **Brasa**: morcego de fogo, em enxame, voando.
- **Lesma-de-Lava**: lenta e enorme; se chega a morder o casco, **apaga uma placa** (a torre para de tocar
  por alguns compassos).
- **Escudeiro**: protege os vizinhos com um escudo-bigorna.
- **Fole**: um fole vivo que **reinfla** (cura) as criaturas perto dele.

**Cidadela (o próprio silêncio)**
- **Sombra**: cópia escura de um dos SEUS músicos. Enquanto vive, **cala todos os instrumentos iguais ao
  que ela imita**. A banda precisa ser variada.
- **Cavaleiro do Silêncio**: armadura pesada e escudo; não fica lento com sinos.
- **Regente Sombrio**: rege as outras criaturas, que **aceleram no tempo forte** enquanto ele vive.

## Os Guardiões (um fragmento em cada terra)

O Silêncio deixou um guardião com cada fragmento, e o fragmento **corrompeu** o guardião:

- **O Grande Borrão** (Prado): uma poça de tinta enorme enrolada no Sino. Vencido, chove em pétalas.
- **O Escaravelho** (Dunas): besouro de areia que se enterra, com o fragmento brilhando nas costas.
  Vencido, vira um escaravelho dourado comum e vai embora tranquilo.
- **A Mariposa-Rainha** (Picos): cobre a aurora de pó cinza e congela torres. Vencida, as asas ganham as cores
  da aurora.
- **O Golem da Forja** (Forja): gigante de pedra com placas de armadura de tinta e o fragmento no peito. Vencido,
  as placas caem e aparece um gigante gentil, o ferreiro que forjava os sinos do mundo.
- **O Silêncio** (Cidadela): ele mesmo guarda o último fragmento.

O Coração no casco **mostra quantos fragmentos voltaram**: cinco facetas que acendem uma a uma, em todas as
fases.

## A história que se descobre (capítulos e interlúdios)

Cada terra começa com uma **abertura de capítulo** (letreiro "Capítulo II · Dunas do Eco") e cada fase
vencida termina com um **interlúdio**. Os resgates seguem uma forma fixa, para o jogador aprender a lê-la:
**o lugar** (com o nome do lugar no canto) → **o prisioneiro** de perto, cinza → **a banda toca** (rios de
notas voam do casco até ele) → **a prisão se quebra** e a cor escorre para dentro dele → **a reação** (sempre
com graça) → o **motivo** do músico (o tema dele na música) → **o pulo para o casco**, onde a banda comemora.
Os guardiões também: **o guardião se liberta** → **o fragmento sobe e voa para o Coração** (uma faceta acende)
→ **a Voz canta** e um fio de luz a liga de novo ao Coração → **uma onda de cor** cobre a terra.
As **memórias** do Silêncio têm outro olhar: tarja mais larga, moldura violeta, tom sépia, granulado, caixinha
de música, e nenhuma tartaruga.

**Prado das Cantigas**
- *Capítulo I*: o prado cinza na luz dourada, a tartaruga pequena com seu círculo de cor; teleobjetiva até o
  Sino no morro, **enrolado em tinta**, o Grande Borrão se mexe; o Maestro aponta, Lira concorda.
- **Fase 1 → 2** (*O Tambor de Pedra*, lugar: Tambores no Vale): uma praça de aldeia cinza. Bumbo é uma
  estátua no meio de uma batida. Lira toca, a cor escorre para dentro da pedra, Bumbo **acorda num susto, cai
  do pedestal**, fica tonto, bate o tambor feliz e pula no casco.
- **Fase 2 → 3** (*A Gaiola de Espinhos*, lugar: O Campanário): ao entardecer, um campanário; Dona Badalo
  tremendo numa gaiola de espinhos de tinta no alto. Tambor e harpa tocam juntos, os espinhos esfarelam, ela
  toca o sininho e desce voando para o casco. Teleobjetiva: ao longe, o Sino nos braços do Grande Borrão.
- **Fase 3 → 4** (*Cinco Estrelas Apagadas*): noite, fogueira, vaga-lumes; a tartaruga deitada; a banda toca
  baixinho em volta do Coração. O Maestro olha para cima: **cinco estrelas apagadas**. No morro, o Borrão se
  ergue.
- **Guardião** (*O Sino Toca*): o Grande Borrão vira **chuva de pétalas**; o **primeiro fragmento** (verde)
  volta (1 de 5); o Sino toca; a cor cobre o prado; ao pôr do sol a tartaruga segue.
- *Trilha dos Vagalumes* — **Memória 1** (*Vagalumes*): um vultinho de máscara, sozinho num morro à noite,
  assiste a uma festa de vagalumes no vale. Ele balança um pouco com a música. Um dançarino olha para o
  morro… e se vira. Ninguém o vê.

**Dunas do Eco**
- *Capítulo II*: dunas cinzentas tremendo de calor; uma cabeça na areia: Chocalho, enterrado até o pescoço,
  sacudindo um chocalho que não faz som. A banda toca, ele **pula da areia** e vai para o casco.
- **Fase 1 → 2** (*O Cristal do Oásis*, lugar: O Oásis): Cristalina presa num cristal cinza perto da água.
  A música faz o cristal vibrar e brilhar até **estourar** em lascas lilases; ela rodopia de alegria.
- **Fase 2 → 3** (*Obeliscos na Noite*, lugar: Obeliscos Mudos): acampamento no deserto; **obeliscos mudos**
  com o X sobem da areia um a um em círculo; a banda para e treme, a fogueira encolhe; a câmera sobe e mostra o
  acampamento cercado.
- **Fase 3 → 4** (*O Escaravelho*): a areia treme; **o Escaravelho** irrompe da duna com o fragmento laranja
  brilhando nas costas, encara a tartaruga e mergulha de novo.
- **Guardião** (*A Harpa ao Vento*): num clarão o Escaravelho vira **um escaravelho dourado comum**, que vai
  embora tranquilo pelas dunas; **segundo fragmento** (2 de 5); a Harpa das Dunas toca sozinha com o vento; o
  deserto floresce.
- *Miragem* — **Memória 2** (*Palmas Mudas*): uma festa no oásis, palmas que soltam faíscas douradas; o vultinho
  chega perto e bate palmas: só sai poeira cinza. Tenta de novo. A festa continua. Ele vai embora pelas dunas.

**Picos de Cristal**
- *Capítulo III*: passo nevado; Trompa congelado num bloco de gelo. **Bumbo toca e o gelo esquenta**,
  rachaduras, estilhaços; Trompa treme de frio e dá o primeiro sopro — a neve pula das árvores.
- **Fase 1 → 2** (*O Coro Gelado*, lugar: O Coro Gelado): os Coralitos congelados num galho. A trompa derrete o
  gelo, eles cantam… **desafinados** (o Maestro faz careta) e depois certinho, e pulam no casco.
- **Fase 2 → 3** (*O Lago de Espelho*, lugar: Lago de Espelho): o Maestro vai até a borda do casco e olha o lago
  congelado: no reflexo, ele… e **atrás dele, o Silêncio**. Ele se vira: nada. No gelo, só ele agora.
  (O reflexo é um espelho de verdade; o Silêncio só existe dentro dele.)
- **Fase 3 → 4** (*A Aurora Apagada*): noite de aurora; a **Mariposa-Rainha** cruza o céu soltando pó cinza; a
  aurora se apaga, o Órgão escurece, a banda treme.
- **Guardião** (*O Órgão Canta*): as asas da Mariposa ganham as cores da aurora; **terceiro fragmento** (3 de 5);
  o Órgão de Cristal canta e a aurora volta.
- *Aurora Partida* — **Memória 3** (*Notas Quebradas*): sozinho no gelo, o vultinho junta notas quebradas do chão
  e as engole, uma por uma. A máscara **racha** pela primeira vez.

**Forja do Trovão**
- *Capítulo IV*: campos de cinza caindo; Grave, acorrentado, puxa uma carroça de pedras. A banda toca, a
  **corrente se parte**, ele se vira e **arrebenta a carroça**, pega o contrabaixo e pula no casco — o casco
  afunda e todo mundo quica.
- **Fase 1 → 2** (*A Ponte de Lava*, lugar: Rios de Lava): a tartaruga atravessa uma ponte de pedra sobre um rio
  de lava; ao longe o Golem martela uma bigorna: a cada martelada o chão treme, a lava espirra e a banda pula.
- **Fase 2 → 3** (*A Bigorna*): fumaça; o Carrilhão calado; a Bigorna gigante; na fumaça, a silhueta do Golem com
  o fragmento vermelho no peito.
- **Fase 3 → 4** (*O Golem Desperta*): os olhos do Golem acendem; ele se levanta; o chão estoura.
- **Guardião** (*O Ferreiro Gentil*): as placas de tinta caem e aparece **um gigante gentil de barba de musgo**, o
  ferreiro; **quarto fragmento** (4 de 5); ele bate no Carrilhão com o martelo, o Carrilhão toca e **uma estrada
  de luz** aparece no céu, rumo à Cidadela.
- *Coração Vulcânico* — **Memória 4** (*A Coroa Partida*): o vultinho engole todos os sons em volta (rios de notas
  vindo de todo lado) e cresce, cresce, até virar o Silêncio. Cinco linhas de pauta em volta da cabeça se partem.

**Cidadela do Silêncio**
- *Capítulo V*: escadarias de mármore cinza sem fim (a tartaruga sobe degrau por degrau); o Coração (4 de 5)
  solta um **raio de luz** que aponta o caminho até a Agulha.
- **Fase 1 → 2** (*Ecos Vazios*): **sombras da própria banda** dos dois lados da estrada imitam tudo em silêncio. A
  banda toca: elas tocam, sem som. A banda para: elas param. Bumbo acena… a sombra acena de volta.
- **Fase 2 → 3** (*A Máscara se Vira*): do alto da Agulha, a máscara do Silêncio vira devagar na direção da
  tartaruga. O Maestro treme… e ergue a batuta.
- **Fase 3 → 4** (*O Silêncio Desce*): o Silêncio desce da Agulha como fumaça, crescendo, e pousa na estrada. A
  banda se prepara, o Maestro ergue a batuta: clarão. A batalha final começa.

## O final (*A Grande Canção*, ≈ 3 min, com os créditos)

1. **A queda**: o Silêncio, imenso, cambaleia e desaba; onda de choque, poeira.
2. **Encolhe** numa tempestade de tinta até ficar **pequeno e sozinho**, ajoelhado na poeira — e agora é a
   tartaruga que parece uma montanha atrás dele. A banda se debruça na borda do casco para olhar.
3. O Maestro **pula do casco**… e **tropeça no fraque** ao pousar. Levanta, ajeita-se.
4. **A pausa**: ele não ataca; rege **um compasso inteiro de silêncio verdadeiro**. O tempo para (tudo congela,
   só a câmera gira em volta) e um **sinal de pausa** (𝄽) de luz aparece sobre a batuta.
5. **O primeiro respiro**: o pequeno levanta a cabeça; Lira toca uma nota.
6. **O último fragmento**: ele estende as mãos e devolve o fragmento dourado, que voa até o Coração.
7. **O Coração completo** (5 de 5): clarão, um pilar de luz sobe ao céu, onda de cor.
8. **A Grande Canção**: a banda inteira em concerto, o pequeno Silêncio sentado na frente do casco com os
   Coralitos. Montagem no tempo — e um dos Coralitos solta uma nota azeda.
9. **As cinco Vozes** tocam uma depois da outra (teleobjetiva em cada uma), e os cinco fios de luz voltam a
   ligá-las ao Coração (o reflexo do amanhecer da abertura).
10. **Os guardiões redimidos chegam para a festa**: o escaravelho dourado dançando, o ferreiro gentil acenando e
    batendo palmas (a palma derruba o Maestro), a mariposa-aurora voando em círculos — ela pousa no nariz da
    tartaruga, que fica vesga… e **espirra**.
11. **A noite**: fogos de artifício de notas saindo do casco; o **manto do Silêncio vira as estrelas**.
12. **O mundo floresce**: a câmera sobe, a cor corre pela Cidadela inteira.
13. **A reverência**: o Maestro se curva, a banda se curva, a tartaruga abaixa a cabeça… e o pequeno Silêncio se
    curva **atrasado**, sozinho.
14. **Os créditos do elenco**, alegres: cada personagem em close fazendo a sua graça, com o nome (Vovó Tuba,
    o Maestro, Lira, Bumbo, Dona Badalo, Chocalho, Cristalina, Trompa, os Coralitos, Grave, o Silêncio — "o
    respiro entre as notas").
15. Os créditos rolam sobre a tartaruga andando sob as estrelas novas. **Fim**.

## O Abismo (segredo, depois do final)

- **Memória 5** (olhar de memória): no escuro do abismo, as cinco linhas da Grande Canção descem em espiral,
  cheias de notas. Lá no fundo, **uma pausa que ninguém nunca tocou**, cinza, esquecida. Ela pisca… e dela
  nasce um vultinho de máscara.
- **Epílogo — a Próxima Turnê**: primavera, um ano depois. A banda inteira toca no casco, o Coração completo. E
  na frente, com os Coralitos, um **vultinho de máscara**. No meio da música ele ergue a mão: **todos param**
  (uma pausa, com o sinal de luz); um respiro; e a música volta ainda mais feliz. O Maestro pisca para ele. A
  tartaruga segue rumo ao sol. "Obrigado por jogar!"

## Como as cenas entram no jogo

- **Novo jogo** → abertura → *Capítulo I* → fase 1.
- **Primeira vez numa terra** → a abertura do capítulo toca antes da primeira fase dela.
- **Vitória** → resultados (com um aviso brilhante "Nova cena") → o interlúdio da fase toca **no caminho para a
  próxima fase ou para o mapa** (Tentar de novo não toca a cena). Depois de vista, a cena fica disponível no
  botão **Ver a cena** dos resultados.
- **O Silêncio (c4)** → o final, com os créditos → mapa. **O Abismo (cx)** → memória 5 e epílogo → mapa.
- O que já foi visto fica em `save.flags` (`intro`, `ch:<terra>`, `sc:<fase>`, `ending`, `epilogue`).
- **História** (menu principal): a galeria com todas as cenas por capítulo; as que ainda não foram alcançadas
  aparecem veladas.
- O Coração no casco mostra os fragmentos já recuperados (guardiões vencidos) nas fases, no menu e nas cenas. Na
  estrada de cada terra, a Voz do fim do caminho fica **enrolada em tinta** até o guardião da terra cair (chegar
  numa fase comum afrouxa a tinta; chegar no guardião a solta).

## Rotas de desenvolvimento

`?cine=intro`, `?cine=ending`, `?cine=epilogue`, `?cine=ch-desert` (ou `?cine=chapter&world=desert`),
`?cine=m1` … `?cine=cx` (ou `?cine=interlude&id=m1`), `?cine=gallery`; `&cinet=30` começa 30 s depois.
`node scripts/cineshots.cjs <cena> <prefixo> <t1,t2,…>` salva quadros exatos (relógio dirigido à mão);
`node scripts/cineshots.cjs batch <spec.json>` faz várias cenas numa só janela.
