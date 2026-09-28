import type { Meal } from "@/lib/plan/types";

/**
 * Starting catalog every new account gets. Re-tagged from the earlier prototype's dish list.
 * Ids are stable strings (not generated) so plans and history survive a reseed.
 */
export const SEED_MEALS: Meal[] = [
  // --- Desi, vegetarian ---
  {
    id: "chana-daal",
    name: "Chana Daal",
    tags: ["daal", "roti", "gravy", "halal", "vegetarian", "healthy", "desi", "comfort"],
  },
  {
    id: "masoor-daal",
    name: "Masoor Daal",
    tags: ["daal", "rice", "gravy", "halal", "vegetarian", "healthy", "quick", "desi"],
  },
  {
    id: "moong-daal-tadka",
    name: "Moong Daal Tadka",
    tags: ["daal", "roti", "gravy", "halal", "vegetarian", "healthy", "quick", "desi"],
  },
  {
    id: "rajma",
    name: "Rajma Chawal",
    tags: ["daal", "rice", "gravy", "halal", "vegetarian", "comfort", "desi"],
  },
  {
    id: "aloo-gobi",
    name: "Aloo Gobi",
    tags: ["veg", "roti", "dry", "halal", "vegetarian", "vegan", "healthy", "desi"],
  },
  {
    id: "bhindi-masala",
    name: "Bhindi Masala",
    tags: ["veg", "roti", "dry", "halal", "vegetarian", "vegan", "healthy", "desi"],
  },
  {
    id: "palak-paneer",
    name: "Palak Paneer",
    tags: ["paneer", "roti", "gravy", "halal", "vegetarian", "healthy", "desi"],
  },
  {
    id: "matar-paneer",
    name: "Matar Paneer",
    tags: ["paneer", "roti", "gravy", "halal", "vegetarian", "desi", "comfort"],
  },
  {
    id: "aloo-anday",
    name: "Aloo Anday",
    tags: ["eggs", "roti", "dry", "halal", "vegetarian", "quick", "desi"],
  },

  // --- Desi, meat ---
  {
    id: "chicken-karahi",
    name: "Chicken Karahi",
    tags: ["chicken", "roti", "gravy", "halal", "desi", "comfort"],
  },
  {
    id: "chicken-handi",
    name: "Chicken Handi",
    tags: ["chicken", "roti", "gravy", "halal", "desi", "comfort"],
  },
  {
    id: "chicken-korma",
    name: "Chicken Korma",
    tags: ["chicken", "roti", "gravy", "halal", "desi", "splurge"],
  },
  {
    id: "chicken-jalfrezi",
    name: "Chicken Jalfrezi",
    tags: ["chicken", "roti", "dry", "halal", "desi", "healthy", "quick"],
  },
  {
    id: "aloo-keema",
    name: "Aloo Keema",
    tags: ["beef", "roti", "dry", "halal", "desi", "comfort"],
  },
  {
    id: "beef-nihari",
    name: "Beef Nihari",
    tags: ["beef", "bread", "gravy", "halal", "desi", "splurge", "comfort"],
  },
  {
    id: "mutton-karahi",
    name: "Mutton Karahi",
    tags: ["mutton", "roti", "gravy", "halal", "desi", "splurge"],
  },
  {
    id: "haleem",
    name: "Haleem",
    tags: ["beef", "daal", "bread", "gravy", "halal", "desi", "comfort"],
  },
  { id: "fish-fry", name: "Masala Fried Fish", tags: ["fish", "roti", "fried", "halal", "desi"] },
  {
    id: "chicken-tikka",
    name: "Chicken Tikka",
    tags: ["chicken", "roti", "bbq", "grilled", "halal", "desi", "healthy", "splurge"],
  },
  {
    id: "seekh-kebab",
    name: "Seekh Kebab",
    tags: ["beef", "roti", "bbq", "grilled", "halal", "desi", "splurge"],
  },

  // --- Rice dishes ---
  {
    id: "chicken-biryani",
    name: "Chicken Biryani",
    tags: ["chicken", "rice", "halal", "desi", "splurge", "comfort"],
  },
  {
    id: "beef-biryani",
    name: "Beef Biryani",
    tags: ["beef", "rice", "halal", "desi", "splurge", "comfort"],
  },
  {
    id: "veg-biryani",
    name: "Vegetable Biryani",
    tags: ["veg", "rice", "halal", "vegetarian", "desi"],
  },
  {
    id: "chicken-pulao",
    name: "Chicken Pulao",
    tags: ["chicken", "rice", "halal", "desi", "comfort"],
  },
  {
    id: "matar-pulao",
    name: "Matar Pulao",
    tags: ["veg", "rice", "halal", "vegetarian", "vegan", "desi", "quick"],
  },

  // --- Chinese ---
  {
    id: "chicken-manchurian",
    name: "Chicken Manchurian",
    tags: ["chicken", "rice", "stir-fry", "halal", "chinese", "comfort"],
  },
  {
    id: "chicken-fried-rice",
    name: "Chicken Fried Rice",
    tags: ["chicken", "rice", "stir-fry", "halal", "chinese", "quick"],
  },
  {
    id: "veg-fried-rice",
    name: "Vegetable Fried Rice",
    tags: ["veg", "rice", "stir-fry", "halal", "vegetarian", "vegan", "chinese", "quick"],
  },
  {
    id: "chow-mein",
    name: "Chow Mein",
    tags: ["chicken", "noodles", "stir-fry", "halal", "chinese", "quick"],
  },
  {
    id: "schezwan-noodles",
    name: "Schezwan Noodles",
    tags: ["veg", "noodles", "stir-fry", "halal", "vegetarian", "chinese", "quick"],
  },
  {
    id: "kung-pao-chicken",
    name: "Kung Pao Chicken",
    tags: ["chicken", "rice", "stir-fry", "halal", "chinese"],
  },
  {
    id: "chili-paneer",
    name: "Chilli Paneer",
    tags: ["paneer", "rice", "stir-fry", "halal", "vegetarian", "chinese"],
  },
  {
    id: "hot-sour-soup",
    name: "Hot & Sour Soup",
    tags: ["chicken", "soup", "halal", "chinese", "healthy", "quick"],
  },

  // --- Everything else ---
  {
    id: "margherita-pizza",
    name: "Margherita Pizza",
    tags: ["bread", "veg", "halal", "vegetarian", "italian", "splurge", "comfort"],
  },
  {
    id: "chicken-alfredo",
    name: "Chicken Alfredo Pasta",
    tags: ["chicken", "pasta", "gravy", "halal", "italian", "comfort"],
  },
  {
    id: "spaghetti-bolognese",
    name: "Spaghetti Bolognese",
    tags: ["beef", "pasta", "gravy", "halal", "italian", "comfort"],
  },
  {
    id: "chicken-shawarma",
    name: "Chicken Shawarma Bowl",
    tags: ["chicken", "rice", "grilled", "halal", "middle-eastern", "healthy", "quick"],
  },
  {
    id: "falafel-wrap",
    name: "Falafel Wrap",
    tags: ["veg", "bread", "fried", "halal", "vegetarian", "vegan", "middle-eastern", "quick"],
  },
  {
    id: "grilled-chicken-veg",
    name: "Grilled Chicken & Veg",
    tags: ["chicken", "grilled", "dry", "halal", "american", "healthy"],
  },
  {
    id: "beef-burgers",
    name: "Homemade Beef Burgers",
    tags: ["beef", "bread", "grilled", "halal", "american", "splurge", "comfort"],
  },
  { id: "eat-out", name: "Eat Out / Takeaway", tags: ["eat-out", "halal", "splurge"] },
];
