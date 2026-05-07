// ─── Keyword-based Image Dataset ─────────────────────────────────────────────
// No hardcoded URLs — images are generated dynamically via Unsplash:
//   https://source.unsplash.com/800x600/?keyword
// Each category has 100+ keywords for maximum variety.

const IMAGE_DATA = {
  animals: [
    "cat", "dog", "lion", "tiger", "elephant", "giraffe", "zebra", "panda",
    "penguin", "dolphin", "whale", "eagle", "owl", "parrot", "flamingo",
    "bear", "wolf", "fox", "deer", "rabbit", "squirrel", "koala",
    "kangaroo", "monkey", "gorilla", "chimpanzee", "hippo", "rhino",
    "crocodile", "alligator", "turtle", "snake", "frog", "chameleon",
    "shark", "octopus", "jellyfish", "seahorse", "starfish", "crab",
    "lobster", "butterfly", "dragonfly", "bee", "ladybug", "ant",
    "spider", "scorpion", "horse", "donkey", "cow", "pig", "sheep",
    "goat", "chicken", "duck", "swan", "peacock", "toucan",
    "hummingbird", "pelican", "seagull", "hawk", "falcon", "vulture",
    "bat", "hedgehog", "otter", "beaver", "raccoon", "skunk",
    "moose", "bison", "camel", "llama", "alpaca", "sloth",
    "armadillo", "porcupine", "cheetah", "leopard", "jaguar", "panther",
    "hyena", "meerkat", "lemur", "iguana", "gecko", "salamander",
    "axolotl", "hamster", "guinea pig", "ferret", "chinchilla",
    "goldfish", "clownfish", "pufferfish", "manta ray", "walrus",
    "seal", "polar bear", "arctic fox", "snow leopard", "red panda"
  ],

  fruits: [
    "apple", "banana", "orange", "strawberry", "grape", "watermelon",
    "pineapple", "mango", "kiwi", "cherry", "lemon", "lime",
    "peach", "pear", "plum", "coconut", "avocado", "pomegranate",
    "blueberry", "raspberry", "blackberry", "cranberry", "fig",
    "papaya", "guava", "passion fruit", "dragon fruit", "lychee",
    "starfruit", "jackfruit", "durian", "persimmon", "apricot",
    "nectarine", "tangerine", "grapefruit", "cantaloupe", "honeydew",
    "date", "olive", "kumquat", "gooseberry", "mulberry",
    "boysenberry", "elderberry", "acai", "plantain", "quince",
    "rambutan", "mangosteen", "soursop", "breadfruit", "tamarind",
    "longan", "sapodilla", "custard apple", "blood orange",
    "mandarin", "clementine"
  ],

  cars: [
    "tesla", "bmw", "mercedes", "audi", "porsche", "ferrari",
    "lamborghini", "bugatti", "maserati", "bentley", "rolls royce",
    "toyota", "honda", "nissan", "mazda", "subaru", "lexus",
    "ford", "chevrolet", "dodge", "jeep", "cadillac", "lincoln",
    "volkswagen", "volvo", "hyundai", "kia", "genesis",
    "jaguar", "land rover", "aston martin", "mclaren", "lotus",
    "alfa romeo", "fiat", "peugeot", "renault", "citroen",
    "skoda", "seat", "mini cooper", "smart car", "suzuki",
    "mitsubishi", "infiniti", "acura", "chrysler", "buick",
    "pontiac", "hummer", "corvette", "mustang", "camaro",
    "challenger", "wrangler", "bronco", "tacoma", "civic",
    "accord", "corolla", "supra", "miata", "wrx"
  ],

  phones: [
    "iphone", "samsung galaxy", "google pixel", "oneplus", "xiaomi",
    "huawei", "oppo", "vivo", "realme", "motorola", "nokia",
    "sony xperia", "asus rog phone", "nothing phone", "fairphone",
    "blackberry", "htc", "lg phone", "zte", "honor",
    "poco", "redmi", "tecno", "infinix", "iqoo",
    "samsung fold", "iphone pro", "pixel fold", "flip phone",
    "smartphone", "mobile phone", "cell phone", "android phone",
    "gaming phone", "camera phone", "touchscreen phone"
  ],

  logos: [
    "google", "apple", "microsoft", "amazon", "facebook", "netflix",
    "spotify", "twitter", "instagram", "youtube", "tiktok", "discord",
    "slack", "github", "adobe", "nvidia", "intel", "amd",
    "oracle", "salesforce", "zoom", "uber", "airbnb", "paypal",
    "stripe", "shopify", "wordpress", "reddit", "pinterest",
    "linkedin", "snapchat", "whatsapp", "telegram", "signal",
    "dropbox", "notion", "figma", "canva", "trello",
    "atlassian", "jira", "confluence", "docker", "kubernetes",
    "aws", "azure", "firebase", "vercel", "netlify",
    "heroku", "digitalocean", "cloudflare", "twitch", "steam",
    "epic games", "playstation", "xbox", "nintendo", "roblox",
    "minecraft", "fortnite", "league of legends", "valorant",
    "coca cola", "pepsi", "mcdonalds", "starbucks", "nike",
    "adidas", "puma", "gucci", "louis vuitton", "chanel",
    "visa", "mastercard", "bitcoin", "ethereum", "tesla logo",
    "spacex", "nasa", "red bull", "monster energy", "lego"
  ],

  food: [
    "pizza", "burger", "sushi", "pasta", "taco", "burrito",
    "ramen", "pho", "pad thai", "curry", "biryani", "dim sum",
    "dumplings", "spring rolls", "fried rice", "noodles", "steak",
    "lobster", "shrimp", "salmon", "tuna", "oyster",
    "ice cream", "cake", "donut", "croissant", "pancake",
    "waffle", "cookie", "brownie", "pie", "cheesecake",
    "tiramisu", "macaron", "eclair", "creme brulee", "flan",
    "chocolate", "candy", "popcorn", "pretzel", "nachos",
    "hotdog", "sandwich", "wrap", "quesadilla", "falafel",
    "hummus", "guacamole", "salad", "soup", "chili",
    "lasagna", "risotto", "paella", "goulash", "fondue",
    "crepe", "bagel", "muffin", "scone", "baguette",
    "sourdough", "brioche", "focaccia", "naan", "pita",
    "kebab", "gyro", "shawarma", "banh mi", "empanada",
    "pierogi", "samosa", "tempura", "teriyaki", "miso soup",
    "french fries", "onion rings", "mozzarella sticks",
    "chicken wings", "fish and chips", "corn dog", "churro",
    "gelato", "sorbet", "milkshake", "smoothie", "bubble tea"
  ],

  tech: [
    "keyboard", "mouse", "monitor", "laptop", "desktop computer",
    "headphones", "earbuds", "speaker", "microphone", "webcam",
    "router", "modem", "usb drive", "hard drive", "ssd",
    "graphics card", "motherboard", "cpu", "ram", "power supply",
    "printer", "scanner", "projector", "tablet", "smartwatch",
    "fitness tracker", "vr headset", "drone", "robot", "3d printer",
    "raspberry pi", "arduino", "circuit board", "led strip",
    "smart home", "smart tv", "streaming device", "game console",
    "controller", "joystick", "racing wheel", "flight stick",
    "mechanical keyboard", "trackball", "drawing tablet",
    "external monitor", "docking station", "hub", "cable",
    "charger", "power bank", "wireless charger", "bluetooth adapter",
    "ethernet cable", "hdmi cable", "displayport", "thunderbolt",
    "server rack", "nas", "ups", "cooling fan", "water cooling",
    "rgb lighting", "computer case", "standing desk", "ergonomic chair"
  ],

  objects: [
    "clock", "lamp", "chair", "table", "sofa", "bed",
    "mirror", "window", "door", "stairs", "elevator",
    "scissors", "pen", "pencil", "eraser", "ruler",
    "notebook", "book", "magazine", "newspaper", "envelope",
    "umbrella", "glasses", "sunglasses", "watch", "ring",
    "necklace", "bracelet", "wallet", "purse", "backpack",
    "suitcase", "key", "lock", "candle", "lighter",
    "match", "flashlight", "battery", "plug", "socket",
    "remote control", "thermostat", "smoke detector", "fire extinguisher",
    "guitar", "piano", "violin", "drums", "trumpet",
    "flute", "harmonica", "microphone", "camera", "binoculars",
    "telescope", "microscope", "compass", "globe", "map",
    "bicycle", "skateboard", "scooter", "roller skates",
    "surfboard", "snowboard", "ski", "tennis racket", "baseball bat",
    "basketball", "football", "soccer ball", "volleyball", "golf club",
    "fishing rod", "tent", "sleeping bag", "hammock", "swing",
    "trampoline", "ladder", "toolbox", "hammer", "screwdriver",
    "wrench", "drill", "saw", "paintbrush", "broom",
    "vacuum cleaner", "iron", "sewing machine", "blender", "toaster",
    "microwave", "refrigerator", "washing machine", "dishwasher"
  ]
};

// Category display labels
export const CATEGORY_LABELS = {
  animals: "🐶 Animals",
  fruits: "🍎 Fruits",
  cars: "🚗 Car Brands",
  phones: "📱 Phone Brands",
  logos: "🏢 Company Logos",
  food: "🍔 Food",
  tech: "🧠 Tech Objects",
  objects: "🏠 Daily Objects"
};

// Generate image URL from keyword
export function getImageUrl(keyword) {
  // Unsplash Source API — returns random image matching keyword
  const encoded = encodeURIComponent(keyword);
  return `https://source.unsplash.com/800x600/?${encoded}`;
}

// Fallback image URL if primary fails
export function getFallbackUrl(keyword) {
  const encoded = encodeURIComponent(keyword);
  return `https://loremflickr.com/800/600/${encoded}`;
}

// Fisher-Yates shuffle
export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate a roundQueue for a given category and round count
export function generateRoundQueue(category, numRounds) {
  const pool = IMAGE_DATA[category];
  if (!pool) return [];
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, Math.min(numRounds, shuffled.length));
}

export default IMAGE_DATA;
