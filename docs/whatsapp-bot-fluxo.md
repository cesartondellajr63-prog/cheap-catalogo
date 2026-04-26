# Fluxo de Mensagens — Bot WhatsApp Cheap Pods (Make)

## Visão Geral

Este documento descreve o fluxo completo de mensagens do bot de atendimento automático da Cheap Pods no WhatsApp, implementado via Make.

---

## ETAPA 1 — Boas-vindas + Verificação de Idade

**[Mensagem 1]**
```
Olá, {{nome do cliente}}! 👋 Seja bem-vindo ao atendimento automático da *Cheap Pods*. 🤖
Estamos aqui para te atender da melhor forma possível. Por favor, selecione a opção que melhor atende às suas necessidades!
```

**[Mensagem 2]**
```
{{nome do cliente}}, antes de iniciarmos o atendimento, precisamos que você responda à pergunta a seguir.
```

**[Mensagem 3 — Lista interativa]**
```
⚠️ *Aviso importante:* Nossa loja comercializa produtos impróprios para menores de 18 anos.
{{nome do cliente}}, você confirma que possui 18 anos ou mais?
```

| Campo | Valor |
|---|---|
| Título da lista | `Eu afirmo que não estou mentindo ao responder a esta pergunta.` |
| Subtítulo | `Responda com atenção.` |
| Opção 1 | `✅ Sim, tenho 18 anos ou mais.` |
| Opção 2 | `❌ Não, sou menor de idade.` |

---

## CAMINHO A — Cliente menor de idade

**[Mensagem — Encerramento]**
```
Lamentamos, {{nome do cliente}}, mas não é possível prosseguir com o atendimento. 😔
Nossa loja comercializa produtos destinados *exclusivamente a maiores de 18 anos*, em conformidade com a legislação vigente.
Agradecemos sua honestidade e te desejamos um ótimo dia! 🙏
```

> **Ação no Make:** Encerrar o fluxo para esse contato (sem mais respostas).

---

## CAMINHO B — Cliente maior de idade → Menu Principal

**[Mensagem — Menu Principal]**
```
Perfeito, {{nome do cliente}}! Agora é só escolher o que você precisa. 😊
```

| # | Opção | Descrição |
|---|---|---|
| 1 | `🔞 Tabela de pods disponíveis` | `*Compre por aqui*` |
| 2 | `🛵 Prazo de entrega` | — |
| 3 | `♻️ Garantia` | — |
| 4 | `🦋 Formas de pagamento` | — |
| 5 | `⭐ Grupo de Promoções Especiais` | — |
| 6 | `🧑 Fale com um atendente` | `*Dúvidas ou casos especiais*` |

---

## OPÇÃO 1 — Tabela de pods disponíveis

```
Aqui está o nosso catálogo completo com todos os pods disponíveis, preços e sabores! 🛒

👉 *Acesse agora e faça seu pedido:*
https://www.cheapcatalogo.com

Navegue pelo site, escolha o seu favorito e finalize a compra com facilidade. Qualquer dúvida, é só chamar! 😊
```

---

## OPÇÃO 2 — Prazo de entrega

```
🛵 Trabalhamos com *entrega expressa via motoboy* na região!

⏱️ *Prazo estimado:* de *45 a 150 minutos* após a confirmação do pagamento.

O tempo pode variar de acordo com a distância e a demanda no momento do pedido. Assim que seu pedido for aceito, você receberá as atualizações por aqui. 📦
```

---

## OPÇÃO 3 — Garantia

```
♻️ *Política de Garantia — Cheap Pods*

Nossos produtos são itens *consumíveis*, por isso nossa garantia é limitada.

📋 *Prazo de garantia:* 4 dias corridos após o recebimento do produto.

Caso identifique algum problema dentro desse prazo, entre em contato conosco informando:
• Número do pedido
• Descrição do problema
• Foto ou vídeo do produto com defeito

⚠️ Ao concluir a compra, o cliente declara estar ciente e de acordo com estas condições.
Estamos aqui para garantir a melhor experiência possível! 💚
```

---

## OPÇÃO 4 — Formas de pagamento

```
Aceitamos as seguintes formas de pagamento:

💸 *PIX* — Pagamento instantâneo, sem taxas adicionais, via plataforma *Mercado Pago*. ✅

💳 *Cartão de crédito ou débito* — Processado com segurança pela *Cielo*.
⚠️ Obs: pagamentos via cartão possuem uma taxa de *7%* sobre o valor total do pedido.

Recomendamos o *PIX* para uma experiência mais rápida e sem custo extra! ⚡
```

---

## OPÇÃO 5 — Grupo de Promoções Especiais

```
Fique por dentro de todas as novidades e promoções exclusivas da Cheap Pods! 🌟

📲 *Grupo de Promoções Especiais no WhatsApp:*
[LINK DO GRUPO — A PREENCHER]

Entre no grupo e não perca nenhuma oferta! 🔥
```

> **Pendente:** inserir o link do grupo de promoções no WhatsApp.

---

## OPÇÃO 6 — Fale com um atendente

```
Entendido, {{nome do cliente}}! Vou acionar um de nossos atendentes para te ajudar. 🧑‍💼

Por favor, *descreva brevemente sua dúvida ou situação* para que possamos te atender da melhor forma.
Em instantes alguém entrará em contato com você! ⏳

ℹ️ O atendimento humano está disponível para esclarecimento de dúvidas e casos especiais.
```

> **Ação no Make:** Pausar respostas automáticas do bot para esse contato por **3 horas**.

---

## Implementação no Make

| Passo | Descrição |
|---|---|
| **Trigger** | Webhook ou módulo Z-API que recebe nova mensagem |
| **Verificação de idade** | Router bifurca em Maior de 18 / Menor de 18 |
| **Menu principal** | Router com condições baseadas na resposta da lista interativa |
| **Pausa atendente** | Módulo Sleep ou variável de estado por 3 horas (opção 6) |
| **Listas interativas** | Módulo Z-API `send-button-list` |

### Variável de nome do cliente
O campo `{{nome do cliente}}` deve ser mapeado para a variável que o Make extrai do contato recebido (ex: `{{1.from.name}}` ou similar, conforme o módulo Z-API configurado).
