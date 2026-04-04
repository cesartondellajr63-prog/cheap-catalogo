# PLANO DE MIGRAÇÃO — CheapsPods E-commerce
## Versão Comercial: Next.js + NestJS + Firebase

> **Formato:** Plano estruturado para execução por agente de IA.
> Cada fase possui tarefas atômicas, comandos exatos e critérios de conclusão.
> **Não altere nenhum estilo visual existente.**

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack e Serviços](#2-stack-e-serviços)
3. [Estrutura de Pastas](#3-estrutura-de-pastas)
4. [Variáveis de Ambiente](#4-variáveis-de-ambiente)
5. [Fase 1 — Setup Inicial](#fase-1--setup-inicial)
6. [Fase 2 — Firebase e Modelagem](#fase-2--firebase-e-modelagem)
7. [Fase 3 — Backend NestJS](#fase-3--backend-nestjs)
8. [Fase 4 — Frontend Next.js](#fase-4--frontend-nextjs)
9. [Fase 5 — Testes Unitários](#fase-5--testes-unitários)
10. [Fase 6 — Execução Local](#fase-6--execução-local)

---

## 1. Visão Geral

### Estado atual

| Componente | Tecnologia atual | Problema |
|---|---|---|
| Frontend | HTML + CSS + JS puro | Não escalável, sem roteamento, sem SSR |
| Backend | Vercel Serverless Functions (JS) | Estado em memória, sintaxe mista, sem tipagem |
| Banco de dados | Google Sheets | Sem transações, limite de escrita, não é banco |
| Auth | JWT custom com `global._loginAttempts` | Perde estado no cold start |
| Rate limiting | `global._freteRateLimit` | Não funciona em produção serverless |
| Sessões PIX | `global._pixTokens` | Perde tokens no cold start |
| Pagamento | Mercado Pago (PIX) | Mantido |
| Frete | Lalamove | Mantido |

### Destino

| Componente | Tecnologia nova |
|---|---|
| Frontend | Next.js 14 + TypeScript + App Router |
| Backend | NestJS + TypeScript |
| Banco de dados | Firebase Firestore |
| Auth | Firebase Auth + JWT Guards (NestJS) |
| Rate limiting | Firebase Firestore (TTL documents) |
| Sessões PIX | Firebase Firestore (TTL documents) |
| Pagamento | Mercado Pago (PIX) — **mesmo sistema** |
| Frete | Lalamove — **mesmo sistema** |
| Estilo visual | **100% idêntico ao atual** — copiado para globals.css |

### Princípios de Clean Code aplicados

- **Single Responsibility**: cada módulo/serviço tem uma única responsabilidade
- **Dependency Injection**: via NestJS IoC container
- **DTOs com validação**: `class-validator` em todos os inputs
- **Sem comentários óbvios**: código auto-explicativo com nomes claros
- **Sem estado global**: tudo persistido no Firebase
- **Fail fast**: validações no início de cada função
- **Secrets nunca no código**: somente em variáveis de ambiente

---

## 2. Stack e Serviços

### Tecnologias

```
Frontend:  Next.js 14 (App Router) + TypeScript + CSS Modules
Backend:   NestJS + TypeScript
Database:  Firebase Firestore
Auth:      Firebase Auth + NestJS JWT Guards
Testes:    Jest + @nestjs/testing + React Testing Library
Deploy FE: Vercel
Deploy BE: Railway (processo contínuo, não serverless)
```

### Serviços externos mantidos

```
Mercado Pago  → Pagamento PIX (Access Token + Webhook Secret existentes)
Lalamove      → Cotação de frete (API Key + Secret existentes)
```

### Serviços novos necessários

```
Firebase      → Banco de dados + Auth (criar projeto gratuito)
Resend        → Emails transacionais (free: 3.000/mês)
Railway       → Hospedagem do NestJS (free tier disponível)
Sentry        → Monitoramento de erros (free tier)
```

---

## 3. Estrutura de Pastas

```
cheaps-pods/
├── apps/
│   ├── web/                          ← Next.js (frontend)
│   │   ├── src/
│   │   │   ├── app/                  ← App Router
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx          ← Catálogo (/)
│   │   │   │   ├── produto/
│   │   │   │   │   └── [slug]/
│   │   │   │   │       └── page.tsx  ← Detalhe do produto
│   │   │   │   ├── checkout/
│   │   │   │   │   └── page.tsx      ← Checkout
│   │   │   │   ├── pedido/
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx  ← Rastreamento
│   │   │   │   ├── conta/
│   │   │   │   │   ├── login/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── pedidos/
│   │   │   │   │       └── page.tsx
│   │   │   │   └── admin/
│   │   │   │       ├── page.tsx      ← Dashboard admin
│   │   │   │       └── pedidos/
│   │   │   │           └── page.tsx
│   │   │   ├── components/
│   │   │   │   ├── catalog/
│   │   │   │   │   ├── ProductCard.tsx
│   │   │   │   │   ├── BrandFilter.tsx
│   │   │   │   │   └── SearchBar.tsx
│   │   │   │   ├── checkout/
│   │   │   │   │   ├── CartSummary.tsx
│   │   │   │   │   ├── AddressForm.tsx
│   │   │   │   │   ├── ShippingCalculator.tsx
│   │   │   │   │   └── PixPayment.tsx
│   │   │   │   ├── order/
│   │   │   │   │   └── OrderTimeline.tsx
│   │   │   │   └── ui/
│   │   │   │       ├── Button.tsx
│   │   │   │       ├── Input.tsx
│   │   │   │       └── Spinner.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCart.ts
│   │   │   │   ├── useShipping.ts
│   │   │   │   └── useOrderStatus.ts
│   │   │   ├── lib/
│   │   │   │   ├── api.ts            ← Funções fetch para o backend
│   │   │   │   └── firebase.ts       ← Firebase client config
│   │   │   ├── types/
│   │   │   │   └── index.ts
│   │   │   └── styles/
│   │   │       └── globals.css       ← ESTILOS ORIGINAIS COPIADOS AQUI
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                          ← NestJS (backend)
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   │   ├── auth.module.ts
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   ├── auth.guard.ts
│       │   │   │   ├── roles.guard.ts
│       │   │   │   └── dto/
│       │   │   │       └── login.dto.ts
│       │   │   ├── products/
│       │   │   │   ├── products.module.ts
│       │   │   │   ├── products.controller.ts
│       │   │   │   ├── products.service.ts
│       │   │   │   └── dto/
│       │   │   │       ├── create-product.dto.ts
│       │   │   │       └── update-product.dto.ts
│       │   │   ├── orders/
│       │   │   │   ├── orders.module.ts
│       │   │   │   ├── orders.controller.ts
│       │   │   │   ├── orders.service.ts
│       │   │   │   └── dto/
│       │   │   │       └── create-order.dto.ts
│       │   │   ├── payments/
│       │   │   │   ├── payments.module.ts
│       │   │   │   ├── payments.controller.ts
│       │   │   │   ├── payments.service.ts
│       │   │   │   └── dto/
│       │   │   │       └── create-payment.dto.ts
│       │   │   ├── shipping/
│       │   │   │   ├── shipping.module.ts
│       │   │   │   ├── shipping.controller.ts
│       │   │   │   ├── shipping.service.ts
│       │   │   │   └── dto/
│       │   │   │       └── quote-shipping.dto.ts
│       │   │   ├── webhooks/
│       │   │   │   ├── webhooks.module.ts
│       │   │   │   └── webhooks.controller.ts
│       │   │   ├── customers/
│       │   │   │   ├── customers.module.ts
│       │   │   │   ├── customers.controller.ts
│       │   │   │   └── customers.service.ts
│       │   │   └── notifications/
│       │   │       ├── notifications.module.ts
│       │   │       └── notifications.service.ts
│       │   ├── shared/
│       │   │   ├── firebase/
│       │   │   │   ├── firebase.module.ts
│       │   │   │   └── firebase.service.ts   ← Firebase Admin SDK
│       │   │   ├── guards/
│       │   │   │   └── throttle.guard.ts     ← Rate limiting via Firestore
│       │   │   └── interceptors/
│       │   │       └── logging.interceptor.ts
│       │   └── config/
│       │       └── env.validation.ts         ← Valida todas as env vars na inicialização
│       ├── test/
│       │   └── (testes de integração)
│       ├── tsconfig.json
│       └── package.json
│
├── MIGRATION_PLAN.md                  ← Este arquivo
├── COMO_EXECUTAR_LOCALMENTE.md        ← Criado na Fase 6
└── .gitignore
```

---

## 4. Variáveis de Ambiente

### Backend (`apps/api/.env`)

```env
# Ambiente
NODE_ENV=development
PORT=3001

# Firebase Admin SDK
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Mercado Pago (MESMO DO ATUAL)
MERCADOPAGO_ACCESS_TOKEN=
WEBHOOK_SECRET=

# Lalamove (MESMO DO ATUAL)
LALAMOVE_API_KEY=
LALAMOVE_API_SECRET=

# JWT
JWT_SECRET=

# Admin (MESMO DO ATUAL)
DASHBOARD_USER=
DASHBOARD_PASS=

# Email (novo)
RESEND_API_KEY=

# URL do frontend (para CORS e redirect)
FRONTEND_URL=http://localhost:3000

# Sentry (opcional)
SENTRY_DSN=
```

### Frontend (`apps/web/.env.local`)

```env
# URL do backend
NEXT_PUBLIC_API_URL=http://localhost:3001

# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

---

## Fase 1 — Setup Inicial

**Objetivo:** Criar a estrutura de monorepo com os dois projetos configurados.

### Tarefa 1.1 — Criar estrutura de pastas

```bash
# Na raiz do projeto cheaps-pods:
mkdir -p apps/web apps/api
```

### Tarefa 1.2 — Criar o projeto NestJS

```bash
cd apps/api
npx @nestjs/cli new . --skip-git --package-manager npm
# Quando perguntar nome do projeto: api
```

**Instalar dependências do backend:**

```bash
npm install @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt
npm install firebase-admin
npm install class-validator class-transformer
npm install helmet
npm install resend
npm install --save-dev @types/passport-jwt jest @nestjs/testing supertest @types/supertest
```

### Tarefa 1.3 — Criar o projeto Next.js

```bash
cd ../web
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --skip-install
# Renomear para ter src/:
mkdir -p src/app src/components src/hooks src/lib src/types src/styles
mv app src/app 2>/dev/null || true
npm install
```

**Instalar dependências do frontend:**

```bash
npm install react-hook-form zod @hookform/resolvers
npm install firebase
npm install lucide-react
```

### Tarefa 1.4 — Configurar TypeScript no backend

Substituir o conteúdo de `apps/api/tsconfig.json` por:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@modules/*": ["src/modules/*"],
      "@config/*": ["src/config/*"]
    }
  }
}
```

### Tarefa 1.5 — Copiar estilos originais para o Next.js

Copiar TODO o conteúdo CSS das tags `<style>` dos arquivos `index.html`, `produto.html` e `obrigado.html` para `apps/web/src/styles/globals.css`.

As variáveis CSS a garantir que estejam presentes:

```css
:root {
  --bg: #0a0a0a;
  --surface: #111;
  --surface2: #1a1a1a;
  --border: rgba(255,255,255,0.08);
  --accent: #c8ff00;
  --accent2: #7efff5;
  --text: #fff;
  --muted: rgba(255,255,255,0.45);
  --pill: rgba(255,255,255,0.06);
  --max: 960px;
  --pad: clamp(16px,4vw,32px);
}
```

Importar no `apps/web/src/app/layout.tsx`:

```tsx
import '@/styles/globals.css'
```

**Critério de conclusão:** `npm run dev` nos dois projetos sobe sem erros.

---

## Fase 2 — Firebase e Modelagem

**Objetivo:** Criar o projeto Firebase, definir coleções e migrar dados do Google Sheets.

### Tarefa 2.1 — Criar projeto Firebase

1. Acessar [console.firebase.google.com](https://console.firebase.google.com)
2. Criar projeto: **CheapsPods**
3. Ativar **Firestore Database** (modo produção)
4. Ativar **Authentication** → habilitar provider **Email/Password**
5. Em Configurações do Projeto → Contas de Serviço → Gerar nova chave privada
6. Salvar o JSON baixado e extrair as 3 variáveis de ambiente:
   - `FIREBASE_PROJECT_ID` = campo `project_id`
   - `FIREBASE_CLIENT_EMAIL` = campo `client_email`
   - `FIREBASE_PRIVATE_KEY` = campo `private_key`

### Tarefa 2.2 — Regras de Segurança do Firestore

No console Firebase → Firestore → Regras, configurar:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Produtos: leitura pública, escrita somente autenticado admin
    match /products/{id} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.role == 'admin';
    }

    // Pedidos: leitura/escrita somente pelo backend (Admin SDK ignora essas regras)
    match /orders/{id} {
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      allow write: if false; // somente via Admin SDK no backend
    }

    // Clientes, sessões, rate_limits, audit_logs: somente backend
    match /{collection}/{id} {
      allow read, write: if false;
    }
  }
}
```

### Tarefa 2.3 — Modelagem das Coleções Firestore

#### Coleção `products`

```typescript
interface Product {
  id: string;           // Auto-gerado pelo Firestore
  name: string;         // Ex: "Elfbar BC5000"
  slug: string;         // Ex: "elfbar-bc5000"
  brandId: string;      // Referência à coleção brands
  description: string;
  basePrice: number;    // Em centavos (ex: 8900 = R$89,00)
  images: string[];     // URLs
  active: boolean;
  variants: ProductVariant[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface ProductVariant {
  id: string;
  name: string;         // Ex: "Mango Ice"
  stock: number;
  priceOverride?: number; // Sobrescreve basePrice se definido
  active: boolean;
}
```

#### Coleção `brands`

```typescript
interface Brand {
  id: string;
  name: string;         // Ex: "Elfbar"
  slug: string;         // Ex: "elfbar"
  color: string;        // Cor do dot no filtro (ex: "#c8ff00")
  logoUrl?: string;
  active: boolean;
}
```

#### Coleção `orders`

```typescript
interface Order {
  id: string;           // UUID v4
  orderNumber: string;  // Legível: "CP-2024-001"
  userId?: string;      // Firebase Auth UID (null = guest checkout)
  status: OrderStatus;  // 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
  customer: {
    name: string;
    phone: string;       // Formato: 11999999999
    email?: string;
    address: string;
    city: string;
    lat?: number;
    lng?: number;
  };
  items: OrderItem[];
  subtotal: number;     // Em centavos
  shippingCost: number; // Em centavos
  total: number;        // Em centavos
  mpPreferenceId?: string;
  mpPaymentId?: string;
  paymentMethod: 'PIX' | 'CARD' | 'BOLETO';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface OrderItem {
  productId: string;
  productName: string;  // Snapshot do nome no momento da compra
  variantId: string;
  variantName: string;  // Snapshot do sabor/variante
  quantity: number;
  unitPrice: number;    // Em centavos, snapshot do preço
  subtotal: number;
}

type OrderStatus = 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
```

#### Coleção `customers`

```typescript
interface Customer {
  id: string;           // Firebase Auth UID
  name: string;
  phone: string;
  email?: string;
  addresses: CustomerAddress[];
  createdAt: Timestamp;
}

interface CustomerAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  lat?: number;
  lng?: number;
  isDefault: boolean;
}
```

#### Coleção `sessions` (substitui `global._pixTokens`)

```typescript
interface Session {
  id: string;           // orderId
  tokenHash: string;    // SHA-256 do token
  expiresAt: Timestamp; // TTL de 2 horas
  createdAt: Timestamp;
}
```

#### Coleção `rate_limits` (substitui `global._loginAttempts`)

```typescript
interface RateLimit {
  id: string;           // ip_endpoint (ex: "127.0.0.1_auth")
  attempts: number;
  blockedUntil: Timestamp | null;
  windowStart: Timestamp;
}
```

#### Coleção `shipping_quotes` (cache de cotações)

```typescript
interface ShippingQuote {
  id: string;           // destinationZip
  price: number;        // Em centavos
  priceFormatted: string;
  expiresAt: Timestamp; // TTL de 30 minutos
  createdAt: Timestamp;
}
```

#### Coleção `audit_logs`

```typescript
interface AuditLog {
  id: string;
  entityType: string;   // Ex: "order", "product"
  entityId: string;
  action: string;       // Ex: "status_changed", "payment_received"
  actorId?: string;     // Admin UID ou "system"
  ip?: string;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
}
```

### Tarefa 2.4 — Migrar dados do Google Sheets para Firestore

Criar o script `apps/api/scripts/migrate-from-sheets.ts`:

**Lógica do script:**
1. Ler os dados da planilha "Pedidos" usando a API do Google Sheets (código existente em `dashboard-data.js`)
2. Para cada linha da planilha, criar um documento na coleção `orders` do Firestore com o mapeamento:
   - `row[0]` → `orderNumber`
   - `row[1]` → `createdAt` (converter string dd/MM/yyyy HH:mm:ss para Timestamp)
   - `row[2]` → `customer.name`
   - `row[3]` → `customer.phone`
   - `row[4]` → `customer.address`
   - `row[5]` → `items` (parsear string "Produto x Qty | ...")
   - `row[6]` → `subtotal` (converter "89,00" para 8900 centavos)
   - `row[7]` → `shippingCost`
   - `row[8]` → `total`
   - `row[9]` → `mpPaymentId`
   - `row[10]` → `status` (mapear "Pago ✅" → "PAID", "Não Pago" → "PENDING")
3. Ler a aba "Clientes" e criar documentos na coleção `customers`
4. Logar progresso e erros

**Executar:**

```bash
cd apps/api
npx ts-node scripts/migrate-from-sheets.ts
```

**Critério de conclusão:** Todos os pedidos do Google Sheets visíveis no console do Firebase.

---

## Fase 3 — Backend NestJS

**Objetivo:** Implementar todos os módulos do backend com tipagem completa, validação e segurança.

### Tarefa 3.1 — Firebase Service (Shared)

Criar `apps/api/src/shared/firebase/firebase.service.ts`:

**Responsabilidade:** Inicializar o Firebase Admin SDK e expor o Firestore. Único ponto de acesso ao banco em todo o backend.

```typescript
// Injetar nas variáveis de ambiente:
// FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY

import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app: admin.app.App;
  private _firestore: admin.firestore.Firestore;

  onModuleInit() {
    this.app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
    this._firestore = admin.firestore(this.app);
  }

  get firestore(): admin.firestore.Firestore {
    return this._firestore;
  }
}
```

### Tarefa 3.2 — Validação de Environment Variables

Criar `apps/api/src/config/env.validation.ts`:

**Responsabilidade:** Na inicialização do app, verificar que todas as variáveis obrigatórias estão presentes. Se faltar qualquer uma, o app recusa a subir com mensagem clara.

```typescript
// Variáveis obrigatórias a validar:
const required = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'MERCADOPAGO_ACCESS_TOKEN',
  'WEBHOOK_SECRET',       // OBRIGATÓRIO — sem fallback
  'LALAMOVE_API_KEY',
  'LALAMOVE_API_SECRET',
  'JWT_SECRET',
  'DASHBOARD_USER',
  'DASHBOARD_PASS',
  'FRONTEND_URL',
];

export function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente faltando: ${missing.join(', ')}`);
  }
}
```

Chamar `validateEnv()` em `main.ts` antes de qualquer coisa.

### Tarefa 3.3 — Rate Limiting Guard (via Firestore)

Criar `apps/api/src/shared/guards/throttle.guard.ts`:

**Responsabilidade:** Substituir `global._freteRateLimit` e `global._loginAttempts`. Armazena contagem de requisições por IP no Firestore com TTL.

```typescript
// Configuração por decorator:
// @UseThrottle({ limit: 15, windowSeconds: 300 })

// Lógica:
// 1. Montar chave: `${ip}_${endpoint}`
// 2. Buscar documento em rate_limits/{chave}
// 3. Se blockedUntil > now → rejeitar 429
// 4. Se windowStart + window < now → resetar contador
// 5. Incrementar attempts
// 6. Se attempts >= limit → setar blockedUntil = now + lockoutSeconds
// 7. Salvar no Firestore e continuar
```

### Tarefa 3.4 — Auth Module

**Responsabilidade:** Login de admin com JWT. Clientes usam Firebase Auth diretamente.

`auth.controller.ts` — endpoints:
- `POST /auth/login` → recebe `{ usuario, senha }`, retorna JWT
- `GET /auth/verify` → valida JWT, retorna payload

`auth.service.ts` — lógica:
- Comparar `usuario` e `senha` com `DASHBOARD_USER` e `DASHBOARD_PASS`
- Gerar JWT assinado com `JWT_SECRET`, expira em 24h
- Usar `@nestjs/jwt`

`auth.guard.ts` — guard:
- Validar JWT em qualquer rota marcada com `@UseGuards(AuthGuard)`
- Extrair token do header `x-auth-token`

`login.dto.ts`:
```typescript
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  usuario: string;

  @IsString()
  @MinLength(6)
  senha: string;
}
```

### Tarefa 3.5 — Products Module

**Responsabilidade:** CRUD de produtos e variantes. Leitura pública, escrita somente admin.

`products.controller.ts` — endpoints:
- `GET /products` → lista produtos ativos (público, com SSG no Next.js)
- `GET /products/:slug` → detalhe de produto (público)
- `POST /products` → criar produto (admin)
- `PATCH /products/:id` → atualizar produto (admin)
- `DELETE /products/:id` → desativar produto (admin, soft delete)

`products.service.ts` — lógica:
- Usar `FirebaseService` para acessar coleção `products`
- Ordenar por `brandId` e `name`
- Filtrar somente `active: true` nas rotas públicas

`create-product.dto.ts`:
```typescript
import { IsString, IsNumber, IsArray, Min, IsBoolean } from 'class-validator';

export class CreateProductDto {
  @IsString() name: string;
  @IsString() slug: string;
  @IsString() brandId: string;
  @IsString() description: string;
  @IsNumber() @Min(1) basePrice: number;
  @IsArray() @IsString({ each: true }) images: string[];
  @IsBoolean() active: boolean;
}
```

### Tarefa 3.6 — Orders Module

**Responsabilidade:** Criação e gestão de pedidos.

`orders.controller.ts` — endpoints:
- `POST /orders` → criar pedido
- `GET /orders/:id` → buscar pedido por ID
- `GET /orders` → listar pedidos (admin)
- `PATCH /orders/:id/status` → atualizar status (admin)

`orders.service.ts` — lógica:
- Gerar `orderNumber` sequencial: buscar último pedido e incrementar
- Formato: `CP-YYYY-NNNN` (ex: `CP-2024-0042`)
- Salvar na coleção `orders`
- Registrar `audit_log` em cada mudança de status

`create-order.dto.ts`:
```typescript
import { IsString, IsArray, IsNumber, IsOptional, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsString() productId: string;
  @IsString() variantId: string;
  @IsNumber() @Min(1) quantity: number;
}

export class CreateOrderDto {
  @IsString() customerName: string;
  @IsString() customerPhone: string;
  @IsString() @IsOptional() customerEmail?: string;
  @IsString() address: string;
  @IsString() city: string;
  @IsNumber() shippingCost: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items: OrderItemDto[];
}
```

### Tarefa 3.7 — Payments Module

**Responsabilidade:** Integração com Mercado Pago PIX. Mesma lógica do `pagamento-mp.js` atual, reescrita em NestJS.

`payments.controller.ts` — endpoints:
- `POST /payments/pix` → criar preferência MP e retornar checkoutUrl
- `GET /payments/status/:orderId` → status do pagamento (substitui `status-pedido.js`)

`payments.service.ts` — lógica:

**createPixPayment:**
1. Validar dados do pedido
2. Construir preference object do Mercado Pago (mesmo formato atual)
3. Chamar `POST https://api.mercadopago.com/checkout/preferences`
4. Gerar `accessToken` = `crypto.randomBytes(32).toString('hex')`
5. Salvar hash do token em `sessions/{orderId}` no Firestore com `expiresAt = now + 2h`
6. Retornar `{ checkoutUrl, preferenceId, accessToken }`

**getPaymentStatus:**
1. Buscar sessão em Firestore `sessions/{orderId}`
2. Verificar se token bate (comparar hash) e se não expirou
3. Chamar API do MP para buscar status
4. Retornar status mapeado

**URLs hardcoded no atual → agora via env:**
```typescript
// Antes (hardcoded):
'https://cheapspods-catalogo-cesar8.vercel.app/obrigado.html'

// Agora:
`${process.env.FRONTEND_URL}/pedido/${orderId}`

// notification_url:
`${process.env.BACKEND_URL}/webhooks/mercadopago`
```

`create-payment.dto.ts`:
```typescript
import { IsString, IsNumber, IsArray, IsEmail, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PaymentItemDto {
  @IsString() model: string;
  @IsString() flavor: string;
  @IsNumber() @Min(0.01) price: number;
  @IsNumber() @Min(1) qty: number;
}

export class CreatePaymentDto {
  @IsString() orderId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentItemDto) items: PaymentItemDto[];
  @IsNumber() @Min(0) shippingPrice: number;
  @IsEmail() customerEmail: string;
  @IsString() customerName: string;
  @IsString() customerPhone: string;
  @IsString() address: string;
  @IsString() city: string;
}
```

### Tarefa 3.8 — Shipping Module

**Responsabilidade:** Cotação de frete via Lalamove. Mesma lógica do `frete.js` atual, com dois fixes críticos: sintaxe correta de módulo e cache no Firestore.

`shipping.controller.ts` — endpoints:
- `POST /shipping/quote` → retornar preço do frete

`shipping.service.ts` — lógica:

**getQuote:**
1. Verificar cache no Firestore `shipping_quotes/{destinationZip}` com `expiresAt > now`
2. Se cache válido: retornar preço cacheado
3. Se não: gerar assinatura HMAC (mesmo código atual), chamar Lalamove
4. Validar resposta: `totalReais > 0`
5. Salvar no Firestore com `expiresAt = now + 30min`
6. Retornar preço

**Correção obrigatória vs. atual:**
- Receber `zipCode` ao invés de `lat/lng` — geolocalizar no backend
- A coordenada de origem (`OSASCO_LAT`, `OSASCO_LNG`) vai em variável de ambiente

`quote-shipping.dto.ts`:
```typescript
import { IsString, Matches } from 'class-validator';

export class QuoteShippingDto {
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido' })
  zipCode: string;

  @IsString()
  address: string;
}
```

### Tarefa 3.9 — Webhooks Module

**Responsabilidade:** Receber notificações do Mercado Pago e salvar pedido no Firestore. Assinatura obrigatória — sem fallback.

`webhooks.controller.ts` — endpoints:
- `POST /webhooks/mercadopago` → processar notificação MP

**Lógica do handler:**
1. Validar assinatura HMAC-SHA256 (mesmo código atual de `validarAssinaturaMP`)
2. **Se `WEBHOOK_SECRET` não estiver configurado → lançar exceção na inicialização** (não em runtime)
3. Se assinatura inválida → retornar 403
4. Buscar pagamento na API do MP
5. Se `payment.status === 'approved'`:
   - Verificar idempotência: buscar `orders` onde `mpPaymentId === payment.id`
   - Se já existe → retornar 200 sem fazer nada
   - Atualizar `orders/{orderId}` com `status: 'PAID'`, `mpPaymentId: payment.id`
   - Registrar `audit_log`
   - Salvar/atualizar `customers/{phone}`
   - Disparar email de confirmação via `NotificationsService`
6. Retornar 200

### Tarefa 3.10 — Customers Module

**Responsabilidade:** Gerenciar base de clientes.

`customers.controller.ts` — endpoints:
- `GET /customers` → listar clientes (admin)
- `GET /customers/:id` → detalhe do cliente (admin)

`customers.service.ts` — lógica:
- Operações de leitura na coleção `customers`
- Método `upsertFromOrder(order)` chamado pelo WebhooksModule após pagamento aprovado

### Tarefa 3.11 — Notifications Module

**Responsabilidade:** Envio de emails transacionais via Resend.

`notifications.service.ts` — métodos:
- `sendOrderConfirmation(order)` → email para o cliente com resumo do pedido
- `sendPaymentApproved(order)` → confirmação de pagamento
- `sendOrderShipped(order, trackingCode)` → pedido enviado com rastreamento

**Template de email:**
- Usar as mesmas cores do site: fundo `#0a0a0a`, accent `#c8ff00`
- HTML simples inline para compatibilidade com clientes de email

### Tarefa 3.12 — Configurar Helmet e CORS no main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  validateEnv(); // Falha imediatamente se env incompleta

  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-auth-token'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Remove campos não declarados no DTO
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
```

**Critério de conclusão:** `npm run start:dev` sobe sem erros. Todas as rotas acessíveis via Insomnia/Postman.

---

## Fase 4 — Frontend Next.js

**Objetivo:** Recriar todas as páginas em Next.js preservando 100% dos estilos existentes.

### Tarefa 4.1 — Layout Principal

Criar `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Syne, Inter } from 'next/font/google';
import '@/styles/globals.css';

const syne = Syne({ subsets: ['latin'], weight: ['400', '700', '800'], variable: '--font-syne' });
const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Cheaps Pods — Catálogo',
  description: 'Os melhores pods com os melhores preços',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${syne.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

### Tarefa 4.2 — Página de Catálogo (`/`)

`apps/web/src/app/page.tsx` — Server Component com ISR:

```tsx
// Buscar produtos do backend a cada 60 segundos (ISR)
export const revalidate = 60;

async function getProducts() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`, {
    next: { revalidate: 60 },
  });
  return res.json();
}
```

**HTML gerado deve ser idêntico ao atual `index.html`:**
- Mesma estrutura `<header>`, `.toolbar`, `.catalog`, `.brand-section`, `.model-grid`
- Mesmas classes CSS
- Cart como Client Component (usa localStorage)

Componentes a criar:
- `<Header />` — logo, badge, hero title, stats strip (idêntico ao atual)
- `<Toolbar />` — search input, brand filter buttons (idêntico ao atual)
- `<BrandSection brands={brands} products={products} />` — grid de produtos
- `<ProductCard product={product} />` — card de produto com botão de adicionar ao carrinho
- `<Cart />` — carrinho flutuante (Client Component, persistido em localStorage)

### Tarefa 4.3 — Página de Produto (`/produto/[slug]`)

Baseada no `produto.html` atual. Preservar exatamente o mesmo layout e estilos.

```tsx
// SSG com geração de todas as rotas no build
export async function generateStaticParams() {
  const products = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/products`).then(r => r.json());
  return products.map((p: Product) => ({ slug: p.slug }));
}
```

### Tarefa 4.4 — Página de Checkout (`/checkout`)

Client Component (requer interatividade).

**Fluxo:**
1. Exibir resumo do carrinho (do localStorage)
2. Formulário de dados do cliente (nome, telefone, email)
3. Campo de CEP → ao sair do campo, chamar `POST /shipping/quote`
4. Exibir preço do frete calculado com tempo de expiração
5. Botão "Pagar com PIX" → chamar `POST /payments/pix`
6. Redirecionar para `checkoutUrl` do Mercado Pago

**Validação com Zod:**
```typescript
const checkoutSchema = z.object({
  name: z.string().min(3, 'Nome completo obrigatório'),
  phone: z.string().regex(/^\d{10,11}$/, 'Telefone inválido'),
  email: z.string().email('Email inválido'),
  zipCode: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  address: z.string().min(5, 'Endereço obrigatório'),
  city: z.string().min(2, 'Cidade obrigatória'),
});
```

### Tarefa 4.5 — Página de Rastreamento (`/pedido/[id]`)

Baseada no `obrigado.html` atual. Preservar exatamente o mesmo layout.

**Lógica de polling:**
```typescript
// Hook useOrderStatus:
// 1. Ler accessToken da query string (redirecionamento do MP)
// 2. Fazer polling GET /payments/status/:orderId a cada 3 segundos
// 3. Parar quando status for 'approved' ou 'rejected'
// 4. Exibir QR code PIX se status for 'pending'
// 5. Exibir confirmação se 'approved'
```

### Tarefa 4.6 — Área Admin (`/admin`)

Protegida por login. Equivalente ao dashboard atual.

**Páginas:**
- `/admin/login` → formulário de login (chama `POST /auth/login`)
- `/admin` → dashboard com KPIs: total de pedidos, receita do dia, últimos pedidos
- `/admin/pedidos` → tabela de pedidos com filtro por status, busca por nome/telefone
- `/admin/pedidos/[id]` → detalhe do pedido com botão para atualizar status

**Middleware de proteção:**
```typescript
// apps/web/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('admin-token')?.value;
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');
  const isLoginPage = request.nextUrl.pathname === '/admin/login';

  if (isAdminRoute && !isLoginPage && !token) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

### Tarefa 4.7 — Tipos compartilhados

Criar `apps/web/src/types/index.ts` com todos os tipos necessários (Product, Order, Brand, etc.), espelhando os tipos do backend.

### Tarefa 4.8 — Funções de API

Criar `apps/web/src/lib/api.ts` com todas as funções fetch para o backend:

```typescript
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const api = {
  products: {
    list: () => fetch(`${BASE_URL}/products`).then(r => r.json()),
    getBySlug: (slug: string) => fetch(`${BASE_URL}/products/${slug}`).then(r => r.json()),
  },
  shipping: {
    quote: (body: QuoteShippingDto) =>
      fetch(`${BASE_URL}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  },
  payments: {
    createPix: (body: CreatePaymentDto) =>
      fetch(`${BASE_URL}/payments/pix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    getStatus: (orderId: string, accessToken: string) =>
      fetch(`${BASE_URL}/payments/status/${orderId}?accessToken=${accessToken}`).then(r => r.json()),
  },
  admin: {
    login: (body: LoginDto) =>
      fetch(`${BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
    orders: (token: string) =>
      fetch(`${BASE_URL}/orders`, { headers: { 'x-auth-token': token } }).then(r => r.json()),
    updateOrderStatus: (id: string, status: string, token: string) =>
      fetch(`${BASE_URL}/orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-auth-token': token }, body: JSON.stringify({ status }) }).then(r => r.json()),
  },
};
```

**Critério de conclusão:** `npm run dev` no Next.js mostra o catálogo com produtos do Firebase, com estilos idênticos ao `index.html` original.

---

## Fase 5 — Testes Unitários

**Objetivo:** Cobrir com testes as partes críticas do negócio.

### Tarefa 5.1 — Configurar Jest no backend

`apps/api/jest.config.js`:
```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
  },
};
```

### Tarefa 5.2 — Testes do AuthService

`apps/api/src/modules/auth/auth.service.spec.ts`:

```typescript
describe('AuthService', () => {
  describe('login', () => {
    it('deve retornar token JWT ao receber credenciais corretas', async () => { ... });
    it('deve lançar UnauthorizedException para credenciais incorretas', async () => { ... });
    it('deve lançar UnauthorizedException se DASHBOARD_USER não estiver configurado', async () => { ... });
  });

  describe('validateToken', () => {
    it('deve retornar payload para token válido', async () => { ... });
    it('deve retornar null para token expirado', async () => { ... });
    it('deve retornar null para token com assinatura inválida', async () => { ... });
  });
});
```

### Tarefa 5.3 — Testes do PaymentsService

`apps/api/src/modules/payments/payments.service.spec.ts`:

```typescript
describe('PaymentsService', () => {
  describe('createPixPayment', () => {
    it('deve criar preferência no Mercado Pago e retornar checkoutUrl', async () => { ... });
    it('deve salvar sessão no Firestore com TTL de 2 horas', async () => { ... });
    it('deve lançar erro se MERCADOPAGO_ACCESS_TOKEN não estiver configurado', async () => { ... });
    it('deve rejeitar items com preço zero ou negativo', async () => { ... });
  });

  describe('getPaymentStatus', () => {
    it('deve retornar status pending para pedido sem pagamento', async () => { ... });
    it('deve retornar 403 para accessToken inválido', async () => { ... });
    it('deve retornar 403 para accessToken expirado', async () => { ... });
    it('deve retornar status approved quando MP confirmar pagamento', async () => { ... });
  });
});
```

### Tarefa 5.4 — Testes do WebhooksController

`apps/api/src/modules/webhooks/webhooks.controller.spec.ts`:

```typescript
describe('WebhooksController - Mercado Pago', () => {
  it('deve retornar 403 para assinatura inválida', async () => { ... });
  it('deve retornar 403 se x-signature header estiver ausente', async () => { ... });
  it('deve processar pagamento aprovado e atualizar pedido no Firestore', async () => { ... });
  it('deve ignorar (idempotência) pagamento já processado', async () => { ... });
  it('deve retornar 200 para eventos que não são payment', async () => { ... });
  it('deve disparar email de confirmação após pagamento aprovado', async () => { ... });
});
```

### Tarefa 5.5 — Testes do ShippingService

`apps/api/src/modules/shipping/shipping.service.spec.ts`:

```typescript
describe('ShippingService', () => {
  describe('getQuote', () => {
    it('deve retornar cotação cacheada do Firestore se válida', async () => { ... });
    it('deve chamar Lalamove se cache expirado', async () => { ... });
    it('deve rejeitar CEP fora do Brasil', async () => { ... });
    it('deve rejeitar se Lalamove retornar preço zero', async () => { ... });
    it('deve salvar nova cotação no Firestore com expiresAt de 30 minutos', async () => { ... });
  });
});
```

### Tarefa 5.6 — Testes do OrdersService

`apps/api/src/modules/orders/orders.service.spec.ts`:

```typescript
describe('OrdersService', () => {
  describe('createOrder', () => {
    it('deve gerar orderNumber sequencial no formato CP-YYYY-NNNN', async () => { ... });
    it('deve calcular total corretamente (subtotal + shippingCost)', async () => { ... });
    it('deve salvar snapshot dos produtos (nome e preço) no momento do pedido', async () => { ... });
  });

  describe('updateStatus', () => {
    it('deve registrar audit_log em cada mudança de status', async () => { ... });
    it('deve lançar NotFoundException para pedido inexistente', async () => { ... });
    it('deve rejeitar transição de status inválida (ex: CANCELLED → PAID)', async () => { ... });
  });
});
```

### Tarefa 5.7 — Testes do ThrottleGuard

`apps/api/src/shared/guards/throttle.guard.spec.ts`:

```typescript
describe('ThrottleGuard', () => {
  it('deve permitir requisição dentro do limite', async () => { ... });
  it('deve bloquear ao atingir limite de tentativas', async () => { ... });
  it('deve resetar contador após janela expirar', async () => { ... });
  it('deve retornar 429 com tempo restante para IPs bloqueados', async () => { ... });
});
```

### Tarefa 5.8 — Testes dos Componentes React

`apps/web/src/components/checkout/ShippingCalculator.spec.tsx`:

```typescript
describe('ShippingCalculator', () => {
  it('deve exibir campo de CEP', () => { ... });
  it('deve chamar API de frete ao sair do campo de CEP', async () => { ... });
  it('deve exibir preço formatado após cotação', async () => { ... });
  it('deve exibir erro para CEP inválido', async () => { ... });
  it('deve exibir timer de expiração da cotação', async () => { ... });
});
```

**Executar todos os testes:**

```bash
# Backend:
cd apps/api && npm run test
npm run test:cov  # com cobertura

# Frontend:
cd apps/web && npm run test
```

**Meta de cobertura:** ≥ 80% nos módulos críticos (payments, webhooks, auth, shipping).

---

## Fase 6 — Execução Local

**Objetivo:** Configurar ambiente local e criar o documento para usuário não-técnico.

### Tarefa 6.1 — Configurar variáveis de ambiente locais

```bash
# Backend:
cp apps/api/.env.example apps/api/.env
# Preencher todas as variáveis com os valores reais

# Frontend:
cp apps/web/.env.local.example apps/web/.env.local
# Preencher com URL do backend local e credenciais Firebase
```

### Tarefa 6.2 — Scripts de desenvolvimento

Criar `package.json` na raiz do monorepo:

```json
{
  "name": "cheaps-pods-monorepo",
  "scripts": {
    "dev:api": "cd apps/api && npm run start:dev",
    "dev:web": "cd apps/web && npm run dev",
    "dev": "concurrently \"npm run dev:api\" \"npm run dev:web\"",
    "test:api": "cd apps/api && npm run test",
    "test:web": "cd apps/web && npm run test",
    "test": "npm run test:api && npm run test:web",
    "install:all": "cd apps/api && npm install && cd ../web && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### Tarefa 6.3 — Criar `COMO_EXECUTAR_LOCALMENTE.md`

Após finalizar toda a implementação, criar o arquivo `COMO_EXECUTAR_LOCALMENTE.md` na raiz do projeto com as seguintes seções:

- **O que você precisa instalar** (Node.js, VS Code)
- **Como baixar o projeto** (git clone)
- **Como configurar** (passo a passo para criar .env com capturas de tela indicadas)
- **Como iniciar** (um único comando)
- **Como acessar** (URLs locais)
- **Solução de problemas comuns**

O documento deve ser escrito sem jargões técnicos, assumindo que o leitor nunca usou um terminal.

### Tarefa 6.4 — Verificar funcionamento completo

Executar o checklist abaixo e confirmar que cada item funciona:

```
[ ] Backend sobe em http://localhost:3001
[ ] Frontend sobe em http://localhost:3000
[ ] Catálogo exibe produtos do Firebase com estilos corretos
[ ] Cálculo de frete funciona (chama Lalamove)
[ ] Criação de pedido PIX funciona (redireciona para MP)
[ ] Webhook de pagamento salva pedido no Firebase
[ ] Login do admin funciona
[ ] Dashboard exibe pedidos do Firebase
[ ] Atualização de status do pedido funciona
[ ] Todos os testes passam (npm run test)
[ ] Estilos visuais são idênticos ao projeto original
```

---

## Resumo das Fases

| Fase | Objetivo | Entregáveis |
|---|---|---|
| 1 | Setup | Estrutura de pastas, dependências instaladas, estilos copiados |
| 2 | Firebase | Projeto Firebase criado, coleções modeladas, dados migrados |
| 3 | Backend | NestJS com todos os módulos funcionando (auth, products, orders, payments, shipping, webhooks) |
| 4 | Frontend | Next.js com catálogo, checkout, rastreamento e admin funcionando |
| 5 | Testes | Testes unitários passando com ≥ 80% de cobertura |
| 6 | Local | Ambiente local funcionando, documento para usuário não-técnico criado |

---

## Referências dos sistemas mantidos

- **Mercado Pago PIX:** `https://api.mercadopago.com/checkout/preferences`
- **Webhook MP:** validação HMAC-SHA256 com `x-signature` header
- **Lalamove v3:** `https://rest.lalamove.com/v3/quotations` com HMAC auth
- **Origem Lalamove:** Avenida Analice Sakatauskas, 860, Osasco, SP (configurar em env var `ORIGIN_LAT`, `ORIGIN_LNG`, `ORIGIN_ADDRESS`)

---

*Documento gerado em 2026-04-03 — CheapsPods Migration Plan v1.0*
