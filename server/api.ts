import { Hono } from "hono";
import { reserveBasketAtomically } from "./reservation-service";

type Bindings={DB:D1Database;PRODUCT_IMAGES:R2Bucket;PAYSTACK_SECRET_KEY?:string;APP_MODE:"preview"|"test"|"production"};
export const api=new Hono<{Bindings:Bindings}>().basePath("/api");
api.get("/health",c=>c.json({ok:true,mode:c.env.APP_MODE,payments:c.env.APP_MODE==="test"?"paystack-test":"disabled"}));
api.post("/checkout/reserve",async c=>{if(c.env.APP_MODE==="production")return c.json({error:"production_launch_gate_closed"},503);const body=await c.req.json<{idempotencyKey:string;lines:{variantId:string;quantity:number}[]}>();const orderId=crypto.randomUUID(),reservationId=crypto.randomUUID();try{const result=await reserveBasketAtomically(c.env.DB,{orderId,reservationId,idempotencyKey:body.idempotencyKey,expiresAt:new Date(Date.now()+20*60_000).toISOString(),lines:body.lines});return c.json(result,201)}catch(error){console.error(JSON.stringify({message:"reservation_failed",orderId,error:error instanceof Error?error.message:"unknown"}));return c.json({error:"basket_unavailable"},409)}});
