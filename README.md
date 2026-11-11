# 💬 MultiChat Live OBS Studio

Chat unificado multiplataforma para transmissões ao vivo no OBS Studio com design moderno em balões flutuantes, suporte a emojis, badges de inscrito/membro e ícone identificador de cada plataforma.

---

## ✨ Recursos

- **Suporte Multiplataforma**:
  - 🟣 **Twitch**: Conexão nativa e direta via chat IRC (sem precisar de login). Suporte a emotes do canal, 7TV e BetterTTV!
  - 🔴 **YouTube Live**: Conexão direta com a live via ID, link ou `@handle` do canal. Suporte a badges de membro e emojis da live.
  - 🟢 **Kick**: Suporte em tempo real para chatrooms da Kick.
  - ⚫ **TikTok Live**: Conexão com a live do TikTok pelo `@usuario`.
  - 🌐 **Webhook Universal**: Compatível com extensões como **SocialStream Ninja**, Streamer.bot, MixItUp ou bots próprios via `POST /api/message`.
- **Design Idêntico ao Modelo**:
  - Pílula escura de identificação do usuário com o logo da plataforma correspondente.
  - Ícone circular de inscrição/membro (*badge*) ao lado do nome (com suporte ao badge de peixinho/sub).
  - Balão de mensagem arredondado em tom creme suave (`#fcf8ea`) com sombra suave e texto escuro de alta legibilidade.
  - Fundo 100% transparente para sobreposição perfeita no OBS.
  - Animação suave de entrada e saída automática (*fade-out* ajustável).
  - Suporte completo a emojis e emotes inline. Se a mensagem tiver apenas emojis, eles se destacam.
- **Painel de Controle Completo (`http://localhost:3333`)**:
  - Ative/desative plataformas individualmente.
  - Botões para simular mensagens de teste de cada plataforma no OBS em 1 clique.
  - Ajuste de cores do balão, tamanho da fonte, arredondamento, tempo de permanência na tela e limite de mensagens.
  - Botão com 1 clique para copiar o link da fonte do OBS.

---

## 🚀 Como Iniciar

1. Dê dois cliques no arquivo **`iniciar.bat`** (ou abra o terminal na pasta e execute `node server.js`).
2. O seu navegador abrirá automaticamente em **`http://localhost:3333`**.
3. No painel, ative as plataformas que você vai usar e coloque o nome do seu canal.
4. Clique em **"Salvar e Conectar Plataformas"**.

---

## 🎬 Como Adicionar no OBS Studio

1. Abra o **OBS Studio**.
2. Na sua cena, vá até o quadro **Fontes**, clique em **`+`** e selecione **Navegador** (Browser Source).
3. Dê um nome (por exemplo: *Chat Multiplataforma*).
4. No campo **URL**, cole:
   ```
   http://localhost:3333/overlay
   ```
5. Defina:
   - **Largura**: `450` (ou a largura desejada na sua tela)
   - **Altura**: `800` (ou conforme sua cena)
6. Marque a opção: *"Atualizar navegador quando a cena se tornar ativa"*.
7. Clique em **OK**.
8. Posicione o chat onde desejar na tela!

---

## 🧪 Testando o Chat no OBS

No Painel de Controle (`http://localhost:3333`), use os botões da seção **"Simular Mensagens no OBS"**:
- **Testar Twitch**: Envia mensagem com emojis e selo de inscrito.
- **Testar YouTube**: Envia mensagem com badge de membro.
- **Testar Kick**: Envia mensagem da Kick.
- **Testar TikTok**: Envia mensagem do TikTok.

Você verá as mensagens aparecendo na hora no OBS!
