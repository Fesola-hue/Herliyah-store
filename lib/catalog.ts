export type Variant = { id: string; size: "XS" | "S" | "M" | "L" | "XL"; colour: string; capacity: number; open: boolean };
export type ProductImage = { src:string; alt:string; colour?:string };
export type Product = { id: string; slug: string; name: string; category: "Dresses" | "Sets" | "Separates" | "Occasion"; description: string; priceKobo: number; image: string; images: ProductImage[]; published:boolean; accent: string; preparation: { min: number; max: number; basis: "business days" }; variants: Variant[] };
const sizes: Variant["size"][] = ["XS", "S", "M", "L", "XL"];
function variants(product: string, colours: string[], closed: string[] = []): Variant[] { return colours.flatMap((colour, ci) => sizes.map((size, si) => ({ id: `${product}-${colour.toLowerCase().replace(/\s/g,"-")}-${size.toLowerCase()}`, size, colour, capacity: Math.max(0, 8-si-ci*2), open: !closed.includes(`${colour}-${size}`) }))); }
export const products: Product[] = [
  ["001","amara-drape-dress","Amara Drape Dress","Dresses","A statuesque column silhouette shaped by a soft gathered shoulder and sweeping waist drape.",9200000,"/hero-cream.png","Cream",12,16,["Cream","Cocoa"],["Cocoa-XL"]],
  ["002","ivie-tailored-set","Ivie Tailored Set","Sets","A sculpted cross-neck waistcoat paired with a fluid, long-line trouser.",11000000,"/look-olive.png","Deep olive",14,18,["Deep olive","Espresso"],["Deep olive-XS"]],
  ["003","zuri-wrap-gown","Zuri Wrap Gown","Occasion","Glossy drape, a defined wrap waist and an elegant sleeve made for evening.",7800000,"/flatlay-cocoa.png","Cocoa",10,14,["Cocoa","Cream"],[]],
  ["004","sade-column-dress","Sade Column Dress","Dresses","A clean column with an asymmetric neckline and considered movement.",8600000,"/hero-cream.png","Ivory",12,16,["Ivory","Black"],[]],
  ["005","kosi-sculpted-top","Kosi Sculpted Top","Separates","A quietly dramatic top with folded volume and a close waist.",4700000,"/look-olive.png","Olive",8,12,["Olive","Cream"],["Olive-XL"]],
  ["006","eniola-wide-trouser","Eniola Wide Trouser","Separates","A high rise, softly pleated trouser cut to skim the floor.",5200000,"/look-olive.png","Espresso",8,12,["Espresso","Deep olive"],[]],
  ["007","naya-satin-dress","Naya Satin Dress","Occasion","A liquid satin dress with a curved neckline and restrained shine.",9500000,"/flatlay-cocoa.png","Cocoa",14,18,["Cocoa","Midnight"],["Cocoa-M"]],
  ["008","ada-soft-jacket","Ada Soft Jacket","Separates","Unstructured tailoring with a long line and a clean, single closure.",6800000,"/hero-cream.png","Cream",10,15,["Cream","Olive"],[]],
  ["009","tomi-skirt-set","Tomi Skirt Set","Sets","A fitted shell and sweeping skirt designed as one composed gesture.",10200000,"/flatlay-cocoa.png","Cocoa",12,17,["Cocoa","Black"],[]],
  ["010","lola-pleated-dress","Lola Pleated Dress","Dresses","Precise pleats open into a relaxed ankle-length silhouette.",8900000,"/look-olive.png","Deep olive",11,15,["Deep olive","Cream"],[]],
].map((p) => { const [id,slug,name,category,description,priceKobo,image,accent,min,max,colours,closed]=p as [string,string,string,Product["category"],string,number,string,string,number,number,string[],string[]]; const published=true,auditedColours=[accent]; return { id:`sample-${id}`,slug,name,category,description,priceKobo,image,images:[{src:image,alt:`Sample editorial photograph for ${name}`,colour:accent}],published,accent,preparation:{min,max,basis:"business days"},variants:variants(slug,auditedColours,closed) }; });
export const publishedProducts=products.filter(product=>product.published);
export const formatNaira = (kobo:number) => new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(kobo/100);
export type CartItem = { variantId:string; productId:string; quantity:number };
export const mockCatalogAdapter = { async listProducts(){return products}, async getProduct(slug:string){return products.find(p=>p.slug===slug)??null} };
