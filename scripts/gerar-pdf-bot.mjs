import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', 'Segoe UI', sans-serif;
    background: #f0f2f5;
    color: #1a1a2e;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .page {
    max-width: 780px;
    margin: 0 auto;
    background: white;
    padding: 36px 48px;
  }

  /* HEADER */
  .header {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%);
    color: white;
    border-radius: 16px;
    padding: 28px 36px;
    margin-bottom: 24px;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute;
    top: -40px; right: -40px;
    width: 200px; height: 200px;
    background: rgba(0,200,150,0.12);
    border-radius: 50%;
  }
  .header::after {
    content: '';
    position: absolute;
    bottom: -60px; left: -20px;
    width: 160px; height: 160px;
    background: rgba(0,200,150,0.07);
    border-radius: 50%;
  }
  .header-logo {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #00c896;
    margin-bottom: 10px;
  }
  .header h1 {
    font-size: 26px;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 10px;
  }
  .header p {
    font-size: 13px;
    color: rgba(255,255,255,0.65);
    max-width: 480px;
  }
  .header-badge {
    display: inline-block;
    background: #00c896;
    color: #0f3460;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 4px 12px;
    border-radius: 20px;
    margin-top: 14px;
  }

  /* SECTION TITLES */
  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #00c896;
    margin-bottom: 8px;
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e8ecf0;
  }

  /* STEP BLOCKS */
  .step {
    border: 1.5px solid #e8ecf0;
    border-radius: 12px;
    padding: 11px 16px;
    margin-bottom: 6px;
    background: #fafbfc;
    position: relative;
  }
  .step-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .step-num {
    background: #1a1a2e;
    color: white;
    font-size: 10px;
    font-weight: 700;
    width: 26px; height: 26px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .step-label {
    font-size: 13px;
    font-weight: 700;
    color: #1a1a2e;
  }
  .step-sublabel {
    font-size: 11px;
    color: #8892a4;
    margin-left: auto;
    font-weight: 500;
  }

  /* BUBBLE */
  .bubble-wrap { margin-bottom: 8px; }
  .bubble-label {
    font-size: 10px;
    font-weight: 600;
    color: #8892a4;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    text-transform: uppercase;
  }
  .bubble {
    background: #e9faf4;
    border-left: 3px solid #00c896;
    border-radius: 0 10px 10px 0;
    padding: 10px 14px;
    font-size: 12.5px;
    color: #1a1a2e;
    white-space: pre-line;
    line-height: 1.5;
  }
  .bubble strong { font-weight: 700; }

  /* LIST OPTIONS */
  .list-title {
    font-size: 11px;
    font-weight: 600;
    color: #8892a4;
    margin: 10px 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .list-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    margin-bottom: 4px;
    font-size: 12.5px;
    font-weight: 500;
    background: white;
    border: 1.5px solid #e8ecf0;
  }
  .list-item .emoji { font-size: 15px; }
  .list-item .item-desc {
    font-size: 10.5px;
    color: #8892a4;
    font-weight: 400;
    display: block;
    margin-top: 1px;
  }

  /* BRANCH BLOCKS */
  .branch {
    border-radius: 12px;
    padding: 10px 14px;
    margin-bottom: 6px;
  }
  .branch-a {
    background: #fff5f5;
    border: 1.5px solid #fcd5d5;
  }
  .branch-b {
    background: #f0fdf8;
    border: 1.5px solid #b8f0df;
  }
  .branch-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }
  .branch-tag {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 3px 10px;
    border-radius: 20px;
  }
  .tag-red { background: #ffe0e0; color: #c0392b; }
  .tag-green { background: #c8f7e4; color: #0f7a55; }
  .branch-desc { font-size: 12px; color: #555; font-weight: 600; }

  /* ACTION NOTE */
  .action-note {
    display: block;
    background: #fffbea;
    border: 1.5px solid #f5d76e;
    border-radius: 8px;
    padding: 10px 14px;
    margin-top: 10px;
    font-size: 11.5px;
    color: #7a5c00;
  }
  .action-note .icon { font-size: 13px; margin-right: 5px; }

  /* MENU CARD */
  .menu-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }
  .menu-card {
    background: white;
    border: 1.5px solid #e8ecf0;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .menu-card-num {
    font-size: 10px;
    font-weight: 700;
    color: #00c896;
    margin-bottom: 4px;
  }
  .menu-card-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .menu-card-desc {
    font-size: 11px;
    color: #8892a4;
    font-style: italic;
  }

  /* PENDING */
  .pending {
    background: #f8f4ff;
    border: 1.5px dashed #c4a8f5;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 11.5px;
    color: #6b3fcf;
    display: block;
    margin-top: 10px;
  }

  /* IMPL TABLE */
  .impl-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    font-size: 12px;
  }
  .impl-table th {
    background: #1a1a2e;
    color: white;
    padding: 7px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }
  .impl-table th:first-child { border-radius: 8px 0 0 0; }
  .impl-table th:last-child { border-radius: 0 8px 0 0; }
  .impl-table td {
    padding: 6px 12px;
    border-bottom: 1px solid #e8ecf0;
    vertical-align: top;
  }
  .impl-table tr:nth-child(even) td { background: #fafbfc; }
  .impl-table code {
    background: #f0f2f5;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    color: #0f3460;
    font-family: monospace;
  }

  /* FOOTER */
  .footer {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e8ecf0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10.5px;
    color: #b0b8c8;
  }
  .footer strong { color: #1a1a2e; }

  /* PAGE BREAK */
  .menu-grid { page-break-inside: avoid; }

  @media print {
    body { background: white; }
    .page { padding: 22px 38px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-logo">Cheap Pods</div>
    <h1>Fluxo de Mensagens<br>Bot WhatsApp</h1>
    <p>Documentação completa do atendimento automático via Make — mensagens, caminhos e ações para cada etapa do bot.</p>
    <div class="header-badge">Make · Z-API · WhatsApp</div>
  </div>

  <!-- ETAPA 1 -->
  <div class="section-title">Etapa 1 — Boas-vindas &amp; Verificação de Idade</div>

  <div class="step">
    <div class="step-header">
      <div class="step-num">1</div>
      <div class="step-label">Mensagem de boas-vindas</div>
    </div>
    <div class="bubble">Olá, <strong>{{nome do cliente}}</strong>! 👋 Seja bem-vindo ao atendimento automático da <strong>Cheap Pods</strong>. 🤖
Estamos aqui para te atender da melhor forma possível. Por favor, selecione a opção que melhor atende às suas necessidades!</div>
  </div>

  <div class="step">
    <div class="step-header">
      <div class="step-num">2</div>
      <div class="step-label">Aviso pré-atendimento</div>
    </div>
    <div class="bubble"><strong>{{nome do cliente}}</strong>, antes de iniciarmos o atendimento, precisamos que você responda à pergunta a seguir.</div>
  </div>

  <div class="step">
    <div class="step-header">
      <div class="step-num">3</div>
      <div class="step-label">Verificação de maioridade</div>
      <div class="step-sublabel">📋 Lista interativa</div>
    </div>
    <div class="bubble">⚠️ <strong>Aviso importante:</strong> Nossa loja comercializa produtos impróprios para menores de 18 anos.
<strong>{{nome do cliente}}</strong>, você confirma que possui 18 anos ou mais?</div>

    <div class="list-title">Opções da lista</div>
    <div class="list-item"><span class="emoji">✅</span><div><span>Sim, tenho 18 anos ou mais.</span></div></div>
    <div class="list-item"><span class="emoji">❌</span><div><span>Não, sou menor de idade.</span></div></div>
    <div style="font-size:11px;color:#8892a4;margin-top:8px;font-style:italic;">Título da lista: "Eu afirmo que não estou mentindo ao responder a esta pergunta." · Subtítulo: "Responda com atenção."</div>
  </div>

  <!-- BIFURCAÇÃO -->
  <div class="section-title">Caminhos — Resultado da Verificação</div>

  <div class="branch branch-a">
    <div class="branch-header">
      <span class="branch-tag tag-red">Caminho A</span>
      <span class="branch-desc">Cliente menor de idade</span>
    </div>
    <div class="bubble" style="background:#fff0f0;border-color:#f5a0a0;">Lamentamos, <strong>{{nome do cliente}}</strong>, mas não é possível prosseguir com o atendimento. 😔
Nossa loja comercializa produtos destinados <strong>exclusivamente a maiores de 18 anos</strong>, em conformidade com a legislação vigente.
Agradecemos sua honestidade e te desejamos um ótimo dia! 🙏</div>
    <div class="action-note">
      <span class="icon">⚙️</span>
      <span><strong>Ação no Make:</strong> Encerrar o fluxo para esse contato — sem mais respostas automáticas.</span>
    </div>
  </div>

  <div class="branch branch-b">
    <div class="branch-header">
      <span class="branch-tag tag-green">Caminho B</span>
      <span class="branch-desc">Cliente maior de idade → Menu Principal</span>
    </div>
    <div class="bubble" style="background:#e6faf3;border-color:#00c896;">Perfeito, <strong>{{nome do cliente}}</strong>! Agora é só escolher o que você precisa. 😊</div>

    <div class="list-title" style="margin-top:14px;">Menu Principal — Lista interativa (6 opções)</div>
    <div class="menu-grid">
      <div class="menu-card">
        <div class="menu-card-num">OPÇÃO 1</div>
        <div class="menu-card-title">🔞 Tabela de pods disponíveis</div>
        <div class="menu-card-desc">Compre por aqui</div>
      </div>
      <div class="menu-card">
        <div class="menu-card-num">OPÇÃO 2</div>
        <div class="menu-card-title">🛵 Prazo de entrega</div>
        <div class="menu-card-desc">—</div>
      </div>
      <div class="menu-card">
        <div class="menu-card-num">OPÇÃO 3</div>
        <div class="menu-card-title">♻️ Garantia</div>
        <div class="menu-card-desc">—</div>
      </div>
      <div class="menu-card">
        <div class="menu-card-num">OPÇÃO 4</div>
        <div class="menu-card-title">🦋 Formas de pagamento</div>
        <div class="menu-card-desc">—</div>
      </div>
      <div class="menu-card">
        <div class="menu-card-num">OPÇÃO 5</div>
        <div class="menu-card-title">⭐ Grupo de Promoções Especiais</div>
        <div class="menu-card-desc">—</div>
      </div>
      <div class="menu-card">
        <div class="menu-card-num">OPÇÃO 6</div>
        <div class="menu-card-title">🧑 Fale com um atendente</div>
        <div class="menu-card-desc">Dúvidas ou casos especiais</div>
      </div>
    </div>
  </div>

  <!-- RESPOSTAS DO MENU -->
  <div class="section-title">Respostas do Menu Principal</div>

  <div class="step">
    <div class="step-header">
      <div class="step-num" style="background:#00c896;">1</div>
      <div class="step-label">🔞 Tabela de pods disponíveis</div>
    </div>
    <div class="bubble">Aqui está o nosso catálogo completo com todos os pods disponíveis, preços e sabores! 🛒

👉 <strong>Acesse agora e faça seu pedido:</strong>
https://www.cheapcatalogo.com

Navegue pelo site, escolha o seu favorito e finalize a compra com facilidade. Qualquer dúvida, é só chamar! 😊</div>
  </div>

  <div class="step">
    <div class="step-header">
      <div class="step-num" style="background:#00c896;">2</div>
      <div class="step-label">🛵 Prazo de entrega</div>
    </div>
    <div class="bubble">🛵 Trabalhamos com <strong>entrega expressa via motoboy</strong> na região!

⏱️ <strong>Prazo estimado:</strong> de <strong>45 a 150 minutos</strong> após a confirmação do pagamento.

O tempo pode variar de acordo com a distância e a demanda no momento do pedido. Assim que seu pedido for aceito, você receberá as atualizações por aqui. 📦</div>
  </div>

  <div class="step">
    <div class="step-header">
      <div class="step-num" style="background:#00c896;">3</div>
      <div class="step-label">♻️ Garantia</div>
    </div>
    <div class="bubble">♻️ <strong>Política de Garantia — Cheap Pods</strong>

Nossos produtos são itens <strong>consumíveis</strong>, por isso nossa garantia é limitada.

📋 <strong>Prazo de garantia:</strong> 4 dias corridos após o recebimento do produto.

Caso identifique algum problema dentro desse prazo, entre em contato conosco informando:
• Número do pedido
• Descrição do problema
• Foto ou vídeo do produto com defeito

⚠️ Ao concluir a compra, o cliente declara estar ciente e de acordo com estas condições.
Estamos aqui para garantir a melhor experiência possível! 💚</div>
  </div>

  <div class="step">
    <div class="step-header">
      <div class="step-num" style="background:#00c896;">4</div>
      <div class="step-label">🦋 Formas de pagamento</div>
    </div>
    <div class="bubble">Aceitamos as seguintes formas de pagamento:

💸 <strong>PIX</strong> — Pagamento instantâneo, sem taxas adicionais, via plataforma <strong>Mercado Pago</strong>. ✅

💳 <strong>Cartão de crédito ou débito</strong> — Processado com segurança pela <strong>Cielo</strong>.
⚠️ Obs: pagamentos via cartão possuem uma taxa de <strong>7%</strong> sobre o valor total do pedido.

Recomendamos o <strong>PIX</strong> para uma experiência mais rápida e sem custo extra! ⚡</div>
  </div>

  <div class="step">
    <div class="step-header">
      <div class="step-num" style="background:#00c896;">5</div>
      <div class="step-label">⭐ Grupo de Promoções Especiais</div>
    </div>
    <div class="bubble">Fique por dentro de todas as novidades e promoções exclusivas da Cheap Pods! 🌟

📲 <strong>Grupo de Promoções Especiais no WhatsApp:</strong>
[LINK DO GRUPO — A PREENCHER]

Entre no grupo e não perca nenhuma oferta! 🔥</div>
    <div class="pending">
      <span>🔗</span>
      <span><strong>Pendente:</strong> inserir o link do grupo de promoções do WhatsApp quando disponível.</span>
    </div>
  </div>

  <div class="step" style="page-break-inside: avoid;">
    <div class="step-header">
      <div class="step-num" style="background:#00c896;">6</div>
      <div class="step-label">🧑 Fale com um atendente</div>
    </div>
    <div class="bubble">Entendido, <strong>{{nome do cliente}}</strong>! Vou acionar um de nossos atendentes para te ajudar. 🧑‍💼

Por favor, <strong>descreva brevemente sua dúvida ou situação</strong> para que possamos te atender da melhor forma.
Em instantes alguém entrará em contato com você! ⏳

ℹ️ O atendimento humano está disponível para esclarecimento de dúvidas e casos especiais.</div>
    <div class="action-note">
      <span class="icon">⚙️</span>
      <span><strong>Ação no Make:</strong> Pausar respostas automáticas do bot para esse contato por <strong>3 horas</strong>.</span>
    </div>
  </div>

  <!-- IMPLEMENTAÇÃO -->
  <div class="section-title" style="margin-top:22px;">Implementação no Make</div>

  <table class="impl-table">
    <thead>
      <tr>
        <th>Componente</th>
        <th>Descrição</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Trigger</strong></td>
        <td>Webhook ou módulo Z-API que recebe nova mensagem</td>
      </tr>
      <tr>
        <td><strong>Verificação de idade</strong></td>
        <td>Router bifurca em Maior de 18 / Menor de 18 conforme resposta da lista</td>
      </tr>
      <tr>
        <td><strong>Menu principal</strong></td>
        <td>Router com 6 condições baseadas na opção selecionada na lista interativa</td>
      </tr>
      <tr>
        <td><strong>Pausa atendente</strong></td>
        <td>Módulo Sleep ou variável de estado por <strong>3 horas</strong> (opção 6)</td>
      </tr>
      <tr>
        <td><strong>Listas interativas</strong></td>
        <td>Módulo Z-API <code>send-button-list</code></td>
      </tr>
      <tr>
        <td><strong>Nome do cliente</strong></td>
        <td>Mapear <code>{{nome do cliente}}</code> para a variável do contato no Make (ex: <code>{{1.from.name}}</code>)</td>
      </tr>
    </tbody>
  </table>

  <!-- FOOTER -->
  <div class="footer">
    <span><strong>Cheap Pods</strong> — Bot WhatsApp · Make</span>
    <span>Gerado em abril de 2026</span>
  </div>

</div>
</body>
</html>`;

const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });
const pdf = await page.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' }
});
await browser.close();

writeFileSync('/home/user/cheap-catalogo/docs/whatsapp-bot-fluxo.pdf', pdf);
console.log('PDF gerado: docs/whatsapp-bot-fluxo.pdf');
