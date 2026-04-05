/**
 * seed-products.mjs
 * Migra os 16 produtos estáticos do catálogo para o Firestore via API.
 *
 * Uso:
 *   node scripts/seed-products.mjs
 *
 * Variáveis de ambiente (ou edite diretamente abaixo):
 *   API_URL  — URL base da API  (padrão: http://localhost:3001)
 *   USUARIO  — usuário admin    (padrão: admin)
 *   SENHA    — senha admin
 */

const API_URL = process.env.API_URL  ?? 'http://localhost:3001';
const USUARIO = process.env.USUARIO  ?? 'Octavio2626';
const SENHA   = process.env.SENHA    ?? 'Cheaps2026';

// ── Catálogo estático (espelho de catalog-data.ts) ──────────────────────────
const CATALOG = [
  { id:'eb-king',  brand:'elfbar',     model:'Elfbar King',       puffs:'40K',  price:99.99,  dual:false, flavors:['Strawberry Watermelon','Triple Berry','Blue Razz Ice','Blueberry Sour Raspberry','Black Mint','Cherry Sour','Grape Ice','Strawberry Ice','Passion Fruit','Peach Berry Slush','Hawaiian Slush','Double Apple Ice','Miami Mint','Sakura Splash'] },
  { id:'eb-trio',  brand:'elfbar',     model:'Elf Trio',           puffs:'40K',  price:99.99,  dual:false, flavors:['Orange Blast','Sour Strawberry Dragonfruit','Peach Twist','Pineapple Lime','Scary Berry','Black Mint','Cool Menthol','Sakura Grape'] },
  { id:'eb-te',    brand:'elfbar',     model:'Elfbar TE',          puffs:'30K',  price:89.99,  dual:false, flavors:['Watermelon Ice','Bubbaloo Tutti Frutti','Miami Mint','Watermelon Peach'] },
  { id:'eb-gh',    brand:'elfbar',     model:'Elfbar GH',          puffs:'23K',  price:84.99,  dual:false, flavors:['Peach Mango Watermelon','Watermelon Ice','Blueberry Ice','Grape Ice','Sakura Grape','Miami Mint','Strawberry Banana','Kiwi Dragon Fruit','Ice Mint'] },
  { id:'eb-bc',    brand:'elfbar',     model:'Elf BC',             puffs:'15K',  price:64.99,  dual:false, flavors:['Strawberry Ice Cream','Banana Ice','Sakura Grape','Peach Mango Watermelon','Triple Berry Ice','Pear Watermelon Dragonfruit','Strawberry Kiwi'] },
  { id:'lm-dura',  brand:'lostmary',   model:'Lost Dura',          puffs:'35K',  price:89.99,  dual:false, flavors:['Mango Ice','Miami Mint','Pineapple Ice','Strawberry Ice'] },
  { id:'bs-30k',   brand:'blacksheep', model:'Black Sheep',        puffs:'30K',  price:99.99,  dual:true,  flavors:['Açaí Strawberry + Grape','Mango + Grape','Grape + Grape','Açaí Grape + Strawberry Kiwi','Açaí Strawberry Banana + Grape'] },
  { id:'ox-30k',   brand:'oxbar',      model:'Oxbar 30K',          puffs:'30K',  price:84.99,  dual:false, flavors:['Fanta Strawberry','Strawberry Watermelon','OK Love','Grape Peach','Passion Kiwi','Paradise Grape','Raspberry Watermelon'] },
  { id:'ox-9k',    brand:'oxbar',      model:'Oxbar 9.5K',         puffs:'9.5K', price:64.99,  dual:false, flavors:['Strawberry Watermelon Ice','Kiwi Passion Fruit Guava','Cool Mint','Watermelon Ice','Apple Kiwi Ice','Cola Ice'] },
  { id:'ig-v400m', brand:'ignite',     model:'Ignite V400 Mix',    puffs:'40K',  price:99.99,  dual:true,  flavors:['Orange Ice + Strawberry Ice','Grape Ice + Strawberry','Apple Ice + Strawberry Watermelon','Icy Mint + Peach Grape','Watermelon Grape Ice + Açaí Ice','Strawberry Mango Ice + Banana Ice','Mango Ice + Passion Fruit Guava','Passion Fruit Sour Kiwi + Pineapple Ice','Strawberry Watermelon Ice + Aloe Grape'] },
  { id:'ig-v400',  brand:'ignite',     model:'Ignite V400',        puffs:'40K',  price:104.99, dual:false, flavors:['Grape Peach','Strawberry Apple Watermelon','Grape Banana','Peach Mango Watermelon','Passion Fruit Sour Kiwi','Strawberry','Strawberry Watermelon','Sakura Grape','Tutti Frutti Mix','Grape Ice','Mint','Banana Cherry','Watermelon','Pineapple Ice','Peach'] },
  { id:'ig-v400s', brand:'ignite',     model:'Ignite V400 Sweet',  puffs:'40K',  price:99.99,  dual:false, flavors:['Miami Mint','Strawberry Watermelon','Watermelon Ice','Blueberry Ice','Blue Razz Pop','Pineapple Ice','Grape Ice','Peach Berry Ice','Triple Mango','Cool Menthol'] },
  { id:'ig-v250',  brand:'ignite',     model:'Ignite V250',        puffs:'25K',  price:89.99,  dual:false, flavors:['Strawberry Banana','Icy Mint','Menthol','Strawberry Kiwi','Pineapple Kiwi Dragonfruit','Pineapple Ice','Grape Ice','Watermelon Ice','Minty Melon','Cactus Lime Soda','Strawberry Ice','Blueberry Ice'] },
  { id:'ig-v155',  brand:'ignite',     model:'Ignite V155',        puffs:'15K',  price:84.99,  dual:false, flavors:['Banana Ice','Grape Ice','Strawberry Ice','Tropical Açaí','Watermelon Mix','Strawberry Watermelon Ice','Icy Mint','Strawberry Kiwi','Kiwi Passion Fruit Guava','Watermelon Ice','Strawberry Banana'] },
  { id:'ig-v150',  brand:'ignite',     model:'Ignite V150',        puffs:'15K',  price:79.99,  dual:false, flavors:['Icy Mint','Watermelon Dragon Fruit','Strawberry Ice','Grape Ice','Lemon Lime','Strawberry Kiwi','Watermelon Mix'] },
  { id:'ig-v80',   brand:'ignite',     model:'Ignite V80',         puffs:'8K',   price:74.99,  dual:false, flavors:['Cactus'] },
  { id:'ig-v55',   brand:'ignite',     model:'Ignite V55',         puffs:'5K',   price:69.99,  dual:false, flavors:['Miami Mint','Aloe Grape','Menthol','Strawberry Banana'] },
  { id:'ig-nano',  brand:'ignite',     model:'Ignite V Nano',      puffs:'600',  price:29.99,  dual:false, flavors:['Passion Fruit Sour Kiwi','Strawberry Ice','Icy Mint','Green Apple','Cool Menthol','Tropical Fruit','Pineapple Ice','Grape Ice','Banana Ice'] },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-auth-token'] = token;
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {


  // 1. Login
  console.log(`🔑  Autenticando em ${API_URL}...`);
  const { token } = await post('/auth/login', { usuario: USUARIO, senha: SENHA });
  console.log('✅  Token obtido.\n');

  // 2. Criar produtos
  let criados = 0;
  let erros   = 0;

  for (const p of CATALOG) {
    const body = {
      name:        p.model,
      slug:        p.id,
      brandId:     p.brand,
      description: `${p.model} — ${p.puffs} puffs${p.dual ? ' — Dual' : ''}`,
      basePrice:   p.price,
      images:      [],
      active:      true,
      variants:    p.flavors.map(f => ({
        id:     f.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name:   f,
        stock:  99,
        active: true,
      })),
    };

    try {
      await post('/products', body, token);
      console.log(`  ✅  ${p.model} (${p.flavors.length} sabores)`);
      criados++;
    } catch (e) {
      console.error(`  ❌  ${p.model}: ${e.message}`);
      erros++;
    }
  }

  console.log(`\n🎉  Concluído: ${criados} criados, ${erros} erros.`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
