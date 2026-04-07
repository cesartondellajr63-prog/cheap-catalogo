// Static catalog data — mirrors the original index.html CATALOG constant.
// Used as fallback when the API is unavailable and for generating product pages.

export interface StaticProduct {
  id: string;
  brand: string;
  model: string;
  puffs: string;
  price: number;
  dual: boolean;
  flavors: string[];
}

export const BRANDS_DATA = [
  { id: 'ignite',     label: 'Ignite',      color: '#ff6a00' },
  { id: 'elfbar',     label: 'Elf Bar',     color: '#3b9eff' },
  { id: 'lostmary',   label: 'Lost Mary',   color: '#ff4e6a' },
  { id: 'blacksheep', label: 'Black Sheep', color: '#888888' },
  { id: 'oxbar',      label: 'Oxbar',       color: '#a855f7' },
  { id: 'hqd',        label: 'HQD',         color: '#00c9a7' },
  { id: 'nikbar',     label: 'Nikbar',      color: '#e040fb' },
  { id: 'dinnerlady', label: 'Dinner Lady', color: '#f06292' },
  { id: 'rabbeats',   label: 'Rabbeats',    color: '#ffca28' },
];

export const BRAND_GRADIENTS: Record<string, string> = {
  elfbar:     'linear-gradient(135deg,#0a1628 0%,#1a3a6e 100%)',
  lostmary:   'linear-gradient(135deg,#1a0a0a 0%,#5a1a2a 100%)',
  blacksheep: 'linear-gradient(135deg,#111 0%,#2a2a2a 100%)',
  oxbar:      'linear-gradient(135deg,#120a1a 0%,#3a1a6e 100%)',
  ignite:     'linear-gradient(135deg,#1a0a00 0%,#5a2000 100%)',
  hqd:        'linear-gradient(135deg,#001a16 0%,#003d30 100%)',
  nikbar:     'linear-gradient(135deg,#1a0020 0%,#4a006e 100%)',
  dinnerlady: 'linear-gradient(135deg,#1a0010 0%,#5a0030 100%)',
  rabbeats:   'linear-gradient(135deg,#1a1400 0%,#4a3a00 100%)',
};

export const BRAND_ICONS: Record<string, string> = {
  elfbar: '⚡', lostmary: '💀', blacksheep: '🖤', oxbar: '🟣', ignite: '🔥',
  hqd: '💎', nikbar: '🌀', dinnerlady: '🌸', rabbeats: '🎵',
};

export const CATALOG: StaticProduct[] = [
  { id:'eb-king',  brand:'elfbar',     model:'Elfbar King',      puffs:'40K',  price:99.99,  dual:false, flavors:['Strawberry Watermelon','Triple Berry','Blue Razz Ice','Blueberry Sour Raspberry','Black Mint','Cherry Sour','Grape Ice','Strawberry Ice','Passion Fruit','Peach Berry Slush','Hawaiian Slush','Double Apple Ice','Miami Mint','Sakura Splash'] },
  { id:'eb-trio',  brand:'elfbar',     model:'Elf Trio',          puffs:'40K',  price:99.99,  dual:false, flavors:['Orange Blast','Sour Strawberry Dragonfruit','Peach Twist','Pineapple Lime','Scary Berry','Black Mint','Cool Menthol','Sakura Grape'] },
  { id:'eb-te',    brand:'elfbar',     model:'Elfbar TE',         puffs:'30K',  price:89.99,  dual:false, flavors:['Watermelon Ice','Bubbaloo Tutti Frutti','Miami Mint','Watermelon Peach'] },
  { id:'eb-gh',    brand:'elfbar',     model:'Elfbar GH',         puffs:'23K',  price:84.99,  dual:false, flavors:['Peach Mango Watermelon','Watermelon Ice','Blueberry Ice','Grape Ice','Sakura Grape','Miami Mint','Strawberry Banana','Kiwi Dragon Fruit','Ice Mint'] },
  { id:'eb-bc',    brand:'elfbar',     model:'Elf BC',            puffs:'15K',  price:64.99,  dual:false, flavors:['Strawberry Ice Cream','Banana Ice','Sakura Grape','Peach Mango Watermelon','Triple Berry Ice','Pear Watermelon Dragonfruit','Strawberry Kiwi'] },
  { id:'lm-dura',  brand:'lostmary',   model:'Lost Dura',         puffs:'35K',  price:89.99,  dual:false, flavors:['Mango Ice','Miami Mint','Pineapple Ice','Strawberry Ice'] },
  { id:'bs-30k',   brand:'blacksheep', model:'Black Sheep',       puffs:'30K',  price:99.99,  dual:true,  flavors:['Açaí Strawberry + Grape','Mango + Grape','Grape + Grape','Açaí Grape + Strawberry Kiwi','Açaí Strawberry Banana + Grape'] },
  { id:'ox-30k',   brand:'oxbar',      model:'Oxbar',             puffs:'30K',  price:84.99,  dual:false, flavors:['Fanta Strawberry','Strawberry Watermelon','OK Love','Grape Peach','Passion Kiwi','Paradise Grape','Raspberry Watermelon'] },
  { id:'ox-9k',    brand:'oxbar',      model:'Oxbar',             puffs:'9.5K', price:64.99,  dual:false, flavors:['Strawberry Watermelon Ice','Kiwi Passion Fruit Guava','Cool Mint','Watermelon Ice','Apple Kiwi Ice','Cola Ice'] },
  { id:'ig-v400m', brand:'ignite',     model:'Ignite V400 Mix',   puffs:'40K',  price:0.05, dual:true,  flavors:['Orange Ice + Strawberry Ice','Grape Ice + Strawberry','Apple Ice + Strawberry Watermelon','Icy Mint + Peach Grape','Watermelon Grape Ice + Açaí Ice','Strawberry Mango Ice + Banana Ice','Mango Ice + Passion Fruit Guava','Passion Fruit Sour Kiwi + Pineapple Ice','Strawberry Watermelon Ice + Aloe Grape'] },
  { id:'ig-v400',  brand:'ignite',     model:'Ignite V400',       puffs:'40K',  price:104.99, dual:false, flavors:['Grape Peach','Strawberry Apple Watermelon','Grape Banana','Peach Mango Watermelon','Passion Fruit Sour Kiwi','Strawberry','Strawberry Watermelon','Sakura Grape','Tutti Frutti Mix','Grape Ice','Mint','Banana Cherry','Watermelon','Pineapple Ice','Peach'] },
  { id:'ig-v400s', brand:'ignite',     model:'Ignite V400 Sweet', puffs:'40K',  price:99.99,  dual:false, flavors:['Miami Mint','Strawberry Watermelon','Watermelon Ice','Blueberry Ice','Blue Razz Pop','Pineapple Ice','Grape Ice','Peach Berry Ice','Triple Mango','Cool Menthol'] },
  { id:'ig-v250',  brand:'ignite',     model:'Ignite V250',       puffs:'25K',  price:89.99,  dual:false, flavors:['Strawberry Banana','Icy Mint','Menthol','Strawberry Kiwi','Pineapple Kiwi Dragonfruit','Pineapple Ice','Grape Ice','Watermelon Ice','Minty Melon','Cactus Lime Soda','Strawberry Ice','Blueberry Ice'] },
  { id:'ig-v155',  brand:'ignite',     model:'Ignite V155',       puffs:'15K',  price:84.99,  dual:false, flavors:['Banana Ice','Grape Ice','Strawberry Ice','Tropical Açaí','Watermelon Mix','Strawberry Watermelon Ice','Icy Mint','Strawberry Kiwi','Kiwi Passion Fruit Guava','Watermelon Ice','Strawberry Banana'] },
  { id:'ig-v150',  brand:'ignite',     model:'Ignite V150',       puffs:'15K',  price:79.99,  dual:false, flavors:['Icy Mint','Watermelon Dragon Fruit','Strawberry Ice','Grape Ice','Lemon Lime','Strawberry Kiwi','Watermelon Mix'] },
  { id:'ig-v80',   brand:'ignite',     model:'Ignite V80',        puffs:'8K',   price:74.99,  dual:false, flavors:['Cactus'] },
  { id:'ig-v55',   brand:'ignite',     model:'Ignite V55',        puffs:'5K',   price:69.99,  dual:false, flavors:['Miami Mint','Aloe Grape','Menthol','Strawberry Banana'] },
  { id:'ig-nano',  brand:'ignite',     model:'Ignite V Nano',     puffs:'600',  price:29.99,  dual:false, flavors:['Passion Fruit Sour Kiwi','Strawberry Ice','Icy Mint','Green Apple','Cool Menthol','Tropical Fruit','Pineapple Ice','Grape Ice','Banana Ice'] },
];
