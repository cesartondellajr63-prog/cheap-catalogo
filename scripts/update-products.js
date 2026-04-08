/**
 * update-products.js
 * Apaga todos os produtos existentes e insere o catálogo novo direto no Firestore.
 *
 * Uso (a partir da raiz do projeto):
 *   node scripts/update-products.js
 */

const admin = require('../apps/api/node_modules/firebase-admin');

// ── Credenciais Firebase ─────────────────────────────────────────────────────
const FIREBASE_PROJECT_ID   = 'cheaps-5f413';
const FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@cheaps-5f413.iam.gserviceaccount.com';
const FIREBASE_PRIVATE_KEY  = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDWmI5/03StebPS
PBdzMlRRq1H9SMzXlIDO8kgQXMR5ICl2zGLW1IgWrWVuhfgEeY0AeaC5R3HNRS/N
cN1CAEIqzgOh68zq/0Ehsskp8ogDjR/qMNqdTDjE7CHnwncozU0IfMYILpL4Nxiw
rYKr8hbJlJ9nf7udUeNjEY/UH/lUC23SeCA5HzRIPI+C8RQbu9klLP/eaNKwYyQ7
/a5bJZCforIYa+xAjY8BsfsG2k/olwmPT6Dlc8iJd+o6yq70jaWSXF2YUisv6NCH
5CzqvjChsmfIyh1906ThtIXLY+sxKJegSaNsCTp4FMxfBw9BNSKw/gzOtGMbcAVM
pntcZ+HnAgMBAAECggEAUULpyyvWpg5M8tKAisXHOjnmzUPxFb2NXVBPy6plV/y+
1takovdOJVA59bVTatZgd4qXOzH7vSBy7pfLoT+Zzr2+kGVLbr2D+2/JT1IhAT9C
k5s2XZRMdv14BVwVZWUAw7MEBnskekva1KSPs+7zhBf8mOO8tuEYex5eWZRWBOWx
bvJLibNBczLX7xlBVpKz1kEqAfd1GhIuGOvt/nqIzRnMSTcaQDykIfc5j4NkFjlC
XmSpTaInyn3KqTKpE3JeBYPqMS87M62i4p7aWUT0wRmrpI68miuuRIa/WoO6RHzj
Ysrja7t8fLRNfCoG23bHToT4gKlqvRzMMw6u2eFBQQKBgQDyWOHC90L7aGuWp3uH
3nOvRembVdBpF0+ihipqi1HpcmX0TipTC8xELyxParR3IXfytSHZEfkiq1sIDt8n
dfMlaQe2oozYoFOlxwqLJ1avv8KYnVW00sVzarQUua4KqAnqNHwX4h3gTxHj3rQ+
sdROgREOTKjP/T0WneTJd8afxwKBgQDir3KLOSVQ+hjhUV+x7xxMO8h1x55KqAKZ
CvrA518i74YSAXid2DSVvNXTpatn44wjg1JqAOS/tizsKtquZKpu6kXKYeoKru7l
U8l1HdOxOHAwPICZowmRPgIlHQaWf73OR3/zGZ2Hm74ctAelNZCaM15HZA8RSBBn
M0KznCbs4QKBgQCZS42q1Nsiyj9b8Z8bJ6RHl1KYdmS5RQyTgohsEqqCn2FMcvEk
zM6txqUhqx5ySNJlzRuXAl50Bq4zX6zaeiqOXGyLozCyil+++jN6KC0WSJcgEE25
bqWFR1aX0Yf8p6R16DMirF43l+x6FlIvYi8oZU3TnLwfrFEq8D9bDQ+v2wKBgHJY
Ea1MnBgmr5ooU98LP/jsRweyM5Rw/y53rVjU3NZgf/5hI5hrUMsfP7TM4pM64puf
SFkULk7N9AcE7t39BUOBhMa7cTUGXJbtFreu3fONBnouaqgU52SOJMLXy1TrBrEg
u9fCWgXnd5Q+84RQaqp9stbMEBWlhjCoWMMEx1XBAoGAYojwthjIdB2g+dAAL7Eh
tJB7TtBALNSUMJ5xRA2F43STziuRklguZHsOrt28g7YBvOGhuVck1Jc1Wx9zCr8s
dv2i4uBHzh0WbEOc9RSV1JCI+34VCKXXmv/6Bt2HpRNPmojlhNvgTVnj9G1S+6W1
pMePhBwPuwkAn50s0QOv7hc=
-----END PRIVATE KEY-----`;

// ── Catálogo novo ────────────────────────────────────────────────────────────
const CATALOG = [
  // ── IGNITE ────────────────────────────────────────────────────────────────
  { id:'ig-v400-mix',  brand:'ignite', model:'Ignite V400 Mix',          puffs:'40K',  price:109.99, dual:true,  flavors:['Orange Ice + Strawberry Ice','Mango Ice + Passion Fruit Guava','Pineapple Mango Ice + Strawberry Ice','Peach Watermelon Ice + Mango Ice','Grape Pop + Peach Ice','Passion Fruit Sour Kiwi + Pineapple Ice','Grape Ice + Strawberry','Strawberry Watermelon Ice + Aloe Grape','Icy Mint + Peach Grape','Grape Ice + Watermelon Ice','Watermelon Grape Ice + Acai Ice','Strawberry Mango Ice + Banana Ice','Apple Ice + Strawberry Watermelon'] },
  { id:'ig-v400',      brand:'ignite', model:'Ignite V400 (40K)',         puffs:'40K',  price:104.99, dual:false, flavors:['Watermelon','Strawberry Banana','Cherry Watermelon','Strawberry','Grape','Sakura Grape','Passion Fruit Sour Kiwi','Cola','Strawberry Kiwi','Peach Mango Watermelon','Mint','Strawberry Watermelon'] },
  { id:'ig-v400s',     brand:'ignite', model:'Ignite V400 Sweet',         puffs:'40K',  price:99.99,  dual:false, flavors:['Pineapple Ice','Grape Ice','Peach Berry Ice','Watermelon Ice','Kiwi Strawberry','Blue Razz B-Pop','Triple Mango','Strawberry Apple Watermelon','Strawberry Banana','Green Apple','Banana Cherry','Miami Mint','Blueberry Ice'] },
  { id:'ig-300',       brand:'ignite', model:'Ignite 300 (30K)',          puffs:'30K',  price:99.99,  dual:false, flavors:['Peach Mango','Strawberry Kiwi','Icy Mint','Grape Ice','Minty Melon','Menthol','Pineapple Ice','Strawberry Banana','Watermelon Mix','Pineapple Mango'] },
  { id:'ig-v155',      brand:'ignite', model:'Ignite V155 (15K)',         puffs:'15K',  price:84.99,  dual:false, flavors:['Strawberry Ice','Banana Ice','Pineapple Ice','Kiwi Passion Fruit Guava','Watermelon Dragon Fruit','Icy Mint','Menthol','Strawberry Watermelon Ice','Tropical Acai','Strawberry Banana','Strawberry Kiwi'] },
  { id:'ig-v150',      brand:'ignite', model:'Ignite V150 (15K)',         puffs:'15K',  price:79.99,  dual:false, flavors:['Passion Fruit Lemon','Aloe Grape','Dragon Fruit Lemonade','Green Apple Peach Kiwi','Cherry Watermelon Ice','Grape Ice','Green Apple','Lemon Ice','Pineapple Ice','Strawberry Mango'] },
  { id:'ig-v80',       brand:'ignite', model:'Ignite V80 (8K)',           puffs:'8K',   price:74.99,  dual:false, flavors:['Frozen Mint Water','Spearmint Gum','Passion Fruit Sour Kiwi','Frozen Watermelon','Icy Mint','Strawberry Kiwi','Frozen Strawberry','Mojito Mint','Grape Ice','Banana Ice','Apple Mint','Banana Cherry','Blueberry Lemon','Artic Gum','Frozen Apple'] },
  { id:'ig-vnano',     brand:'ignite', model:'Ignite V Nano (600 Puffs)', puffs:'600',  price:29.99,  dual:false, flavors:['Cool Menthol','Strawberry Ice','Icy Mint','Blueberry Raspberry','Orange Soda Ice','Passion Fruit Sour Kiwi','Watermelon Ice','Strawberry Guava Ice','Pineapple Ice','Acai Grape','Vanilla Cream','Grape Ice'] },
  { id:'ig-v300slim',  brand:'ignite', model:'V300 Slim',                 puffs:'30K',  price:109.99, dual:false, flavors:['Pineapple Mango','Minty Melon','Aloe Grape Ice','Banana Ice','Strawberry Ice','Grape Ice'] },

  // ── HQD ───────────────────────────────────────────────────────────────────
  { id:'hqd-glaze-30k', brand:'hqd', model:'HQD Glaze 30K', puffs:'30K', price:84.99, dual:false, flavors:['Menthol','Ice Mint','Watermelon Ice','Banana Ice'] },

  // ── NIKBAR ────────────────────────────────────────────────────────────────
  { id:'nikbar-10k', brand:'nikbar', model:'Nikbar 10K', puffs:'10K', price:59.99, dual:false, flavors:['Pineapple Ice','Aloe Grape','Strawberry Kiwi','Strawberry Ice','Passion Sour Kiwi','Strawberry Apple Watermelon','Grape Apple Ice','Grape Ice'] },

  // ── ELFBAR ────────────────────────────────────────────────────────────────
  { id:'eb-bc-pro',  brand:'elfbar', model:'ELF BC PRO 45K',    puffs:'45K',  price:114.99, dual:false, flavors:['Blueberry Strawberry Coconut Ice','Grape Ice','Watermelon Peach Frost','Pineapple Pom','Watermelon Ice','Kiwi Passion Fruit Guava','Miami Mint','Cool Menthol','Green Apple Ice','Tropical Baja'] },
  { id:'eb-king',    brand:'elfbar', model:'Elfbar King (40K)', puffs:'40K',  price:99.99,  dual:false, flavors:['Mango Magic','Grape Ice','Peachy','Sour Strawberry Dragonfruit','Black Mint','Summer Splash','Triple Berry','Baja Splash','Strawberry Ice','Cola Slush','Strawberry Watermelon','Tigers Blood','Peach Blue Slush','Scary Berry','Miami Mint','Dragon Strawnana','Strawberry Spark'] },
  { id:'eb-te',      brand:'elfbar', model:'Elfbar TE (30K)',   puffs:'30K',  price:89.99,  dual:false, flavors:['Aloe Banana Ice','Peach Mango Watermelon','Guava Passion Fruit Kiwi','Bubbaloo Grape','Strawberry Watermelon Ice','Menthol','Watermelon Ice','Pineapple Mango'] },
  { id:'eb-bc',      brand:'elfbar', model:'Elf BC (15K)',      puffs:'15K',  price:64.99,  dual:false, flavors:['Mango Magic','Watermelon Ice','Strawberry Kiwi','Pineapple Ice','Tropical Lemonade','Kiwi Passion Fruit Guava','Miami Mint','Bubbaloo Grape','Peach Mango Watermelon'] },
  { id:'eb-gh-23k',  brand:'elfbar', model:'Elfbar GH (23K)',   puffs:'23K',  price:84.99,  dual:false, flavors:['Kiwi Dragon Fruit','Blue Razz Ice','Strawberry Ice','Peach Mango Watermelon','Watermelon Ice','Baja Splash','Ice Mint','Miami Mint','Sakura Grape','Strawberry Banana','Grape Ice'] },
  { id:'eb-gh-33k',  brand:'elfbar', model:'Elfbar GH (33K)',   puffs:'33K',  price:104.99, dual:false, flavors:['Grapefruit Strawnana','Pomegranate Burst','Lemon Lime','Sour Apple','Clear','Apple Kiwi Ice','Grape Ice','Watermelon Ice','Grapefruit Mint Ice','Pine Needles'] },

  // ── LOST MARY ─────────────────────────────────────────────────────────────
  { id:'lm-dura', brand:'lostmary', model:'Lost Dura 35K', puffs:'35K', price:89.99, dual:false, flavors:['Strawberry Watermelon','Blue Razz Ice','Strawberry Kiwi','Summer Orange','Hawaiian Juice','Miami Mint','Watermelon Ice','Strawberry Ice'] },

  // ── OXBAR ─────────────────────────────────────────────────────────────────
  { id:'ox-30k', brand:'oxbar', model:'Oxbar 30K', puffs:'30K', price:84.99, dual:false, flavors:['Blackcurrant Lemon Ice','Paradise Grape','Raspberry Lemon','Sour Mango'] },

  // ── DINNER LADY ───────────────────────────────────────────────────────────
  { id:'dl-50k', brand:'dinnerlady', model:'Dinner Lady 50K', puffs:'50K', price:119.99, dual:true,  flavors:['Watermelon Ice + Blue Mint','Kiwi Passion Fruit + Apple Peach Ice','Mango Passion Ice + Pineapple Ice','Strawberry Kiwi + Cherry Ice'] },
  { id:'dl-20k', brand:'dinnerlady', model:'Dinner Lady 20K', puffs:'20K', price:84.99,  dual:false, flavors:['Kiwi Passion Fruit','Pineapple Ice','Menthol','Icy Mint','Grape Ice','Strawberry Ice','Passionfruit','Strawberry Apple','Banana Ice'] },

  // ── RABBEATS ──────────────────────────────────────────────────────────────
  { id:'rb-50k', brand:'rabbeats', model:'Rabbeats 50K (RC 5000)', puffs:'50K', price:99.99, dual:false, flavors:['Watermelon Ice','Kiwi Passion Fruit Guava','Strawberry Ice','Triple Berry','Blueberry Lemon','Miami Mint','Menthol','Sour Watermelon Peach'] },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Inicializa Firebase Admin
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey:  FIREBASE_PRIVATE_KEY,
    }),
  });

  const db = admin.firestore();
  const col = db.collection('products');
  const now = Date.now();

  // 1. Apagar todos os produtos existentes
  console.log('🗑️  Apagando produtos existentes...');
  const snap = await col.get();
  const batches = [];
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    ops++;
    if (ops === 499) {
      batches.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) batches.push(batch.commit());
  await Promise.all(batches);
  console.log(`  ✅  ${snap.size} produto(s) apagado(s).\n`);

  // 2. Inserir novo catálogo
  console.log('📦  Inserindo novo catálogo...');
  let criados = 0;

  for (const p of CATALOG) {
    const doc = {
      name:        p.model,
      slug:        p.id,
      brandId:     p.brand,
      description: `${p.model} — ${p.puffs} puffs${p.dual ? ' — Dual' : ''}`,
      basePrice:   p.price,
      images:      [],
      active:      true,
      dual:        p.dual,
      variants:    p.flavors.map(f => ({
        id:     f.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name:   f,
        stock:  99,
        active: true,
      })),
      createdAt: now,
      updatedAt: now,
    };

    await col.doc(p.id).set(doc);
    console.log(`  ✅  ${p.model} (${p.flavors.length} sabores)`);
    criados++;
  }

  console.log(`\n🎉  Concluído: ${criados} produto(s) inserido(s).`);
  process.exit(0);
}

main().catch(err => { console.error('❌  Erro fatal:', err.message); process.exit(1); });
