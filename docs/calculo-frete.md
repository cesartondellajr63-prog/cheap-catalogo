# Como funciona o cálculo de frete

**Arquivo:** `apps/api/src/modules/shipping/shipping.service.ts`

---

## Visão geral do fluxo

```
Cliente informa endereço
        ↓
Frontend geocodifica (Nominatim / OpenStreetMap)
        ↓
Frontend envia lat/lng + endereço + CEP para /shipping/quote
        ↓
Backend verifica cache no Firestore (por CEP)
     ↙        ↘
  HIT           MISS
retorna cache   chama Lalamove API
                       ↓
               aplica regras de markup
                       ↓
               salva cache no Firestore
                       ↓
               retorna preço + expiresAt
```

---

## Passo 1 — Geocodificação (frontend)

O cliente preenche o endereço no checkout (rua, número, bairro, cidade, estado, CEP).
O frontend chama a API pública do **Nominatim (OpenStreetMap)** para converter o endereço em coordenadas geográficas (latitude/longitude). Esse processo ocorre no navegador do cliente, sem custo e sem conta.

---

## Passo 2 — Requisição ao backend

O frontend envia um `POST /shipping/quote` com:

```json
{
  "lat": "-23.550520",
  "lng": "-46.633308",
  "address": "Rua das Flores, 123 - Vila Nova, São Paulo - SP",
  "zipCode": "01310100"
}
```

---

## Passo 3 — Cache por CEP (Firestore)

Antes de chamar a Lalamove, o backend consulta a coleção `shipping_quotes` no Firestore usando o CEP como chave de documento.

**Se o cache existir e não tiver expirado:**
- Retorna o preço salvo imediatamente, sem chamar a Lalamove
- Resposta inclui `cached: true`

**Se o cache não existir ou já tiver expirado:**
- Continua para o Passo 4

Estrutura do documento de cache:
```
shipping_quotes/{CEP}
├── price:     número em reais (ex: 13.50)
├── expiresAt: timestamp em ms
├── zipCode:   string do CEP
├── address:   endereço usado
└── createdAt: timestamp em ms
```

---

## Passo 4 — Validação das coordenadas

O backend valida se as coordenadas estão dentro do Brasil:

```
Latitude:  entre -33 e 5
Longitude: entre -73 e -35
```

Se fora desse range → erro 500 ("Endereço fora do Brasil").

---

## Passo 5 — Chamada à Lalamove

O backend assina a requisição com **HMAC-SHA256** usando a chave secreta da Lalamove:

```
rawSignature = "{timestamp}\r\nPOST\r\n/v3/quotations\r\n\r\n{body}"
token        = HMAC-SHA256(rawSignature, LALAMOVE_API_SECRET)
Authorization: hmac {LALAMOVE_API_KEY}:{timestamp}:{token}
```

O payload enviado à Lalamove:
```json
{
  "data": {
    "serviceType": "LALAGO",
    "language": "pt_BR",
    "stops": [
      {
        "coordinates": { "lat": "{ORIGIN_LAT}", "lng": "{ORIGIN_LNG}" },
        "address": "{ORIGIN_ADDRESS}"
      },
      {
        "coordinates": { "lat": "-23.550520", "lng": "-46.633308" },
        "address": "Rua das Flores, 123 - Vila Nova, São Paulo - SP"
      }
    ],
    "item": {
      "quantity": "1",
      "weight": "LESS_THAN_3_KG",
      "categories": ["SMALL_PACKAGE"],
      "handlingInstructions": []
    }
  }
}
```

**Timeout:** 30 segundos. Se a Lalamove não responder → erro 500.

**Erros tratados:**
- `DELIVERY_NOT_AVAILABLE` / `OUT_OF_SERVICE_AREA` → mensagem amigável sobre regiões atendidas
- `INVALID_LOCATION` → mensagem de localização inválida
- Qualquer outro erro → "Falha ao calcular frete"

---

## Passo 6 — Regras de markup (preço final)

O valor retornado pela Lalamove já está **em reais** (não centavos).

| Valor Lalamove | Preço final cobrado |
|---|---|
| Abaixo de R$ 11,00 | **R$ 11,00** (mínimo fixo) |
| Entre R$ 11,00 e R$ 18,00 | **Valor + R$ 2,00** |
| Acima de R$ 18,00 | **Valor original** (sem acréscimo) |

Exemplos:
- Lalamove retorna R$ 8,00 → cliente paga **R$ 11,00**
- Lalamove retorna R$ 15,00 → cliente paga **R$ 17,00**
- Lalamove retorna R$ 22,00 → cliente paga **R$ 22,00**

O valor é arredondado para 2 casas decimais com `Math.round(finalPrice * 100) / 100`.

---

## Passo 7 — Expiração e cache

A validade da cotação é definida por:

1. Se a Lalamove retornar um campo `expiresAt` → usa esse valor
2. Caso contrário → **5 minutos** a partir do momento da consulta

O resultado é salvo no Firestore (`shipping_quotes/{CEP}`) sem bloquear a resposta ao cliente (operação assíncrona em background).

---

## Passo 8 — Resposta ao frontend

```json
{
  "price": 13.50,
  "priceFormatted": "R$ 13,50",
  "expiresAt": 1712500000000
}
```

O frontend exibe o preço e inicia um timer de contagem regressiva até `expiresAt`. Se o timer zerar antes do cliente confirmar, o checkout pede para recalcular o frete.

---

## Origem das entregas

A localização de saída (loja) é configurada por variáveis de ambiente:

```env
ORIGIN_LAT=...
ORIGIN_LNG=...
ORIGIN_ADDRESS=...
```

---

## Regiões atendidas pela Lalamove (LALAGO)

São Paulo, Rio de Janeiro, Belo Horizonte, Curitiba e Porto Alegre (regiões metropolitanas).
Endereços fora dessas áreas retornam erro de serviço não disponível.
