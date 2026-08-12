export type Brand = { id: string; name: string; color: string; created_at: string };
export type Category = { id: string; name: string; created_at: string };

export type FontFace = {
  id: string;
  family: string;      // Montserrat
  style_name: string;  // Light
  full_name: string;   // Montserrat Light  <- lo que ve Illustrator
  weight: number;      // 300
  italic: boolean;
  file_path: string;
  file_url: string;
  format: string;      // woff2 | woff | truetype | opentype
  created_at: string;
};

export type Card = {
  id: string;
  title: string;
  content_html: string;
  content_text: string;
  category_id: string | null;
  brand_id: string | null;
  created_at: string;
  updated_at: string;
};

export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
