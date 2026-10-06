export type ReservationLine = { variantId:string; quantity:number };
export type ReserveInput = { orderId:string; reservationId:string; idempotencyKey:string; expiresAt:string; lines:ReservationLine[] };

export async function reserveBasketAtomically(db:D1Database,input:ReserveInput){
  if(!input.lines.length) throw new Error("empty_basket");
  if(input.lines.some(line=>!Number.isInteger(line.quantity)||line.quantity<1)) throw new Error("invalid_quantity");
  const duplicate=await db.prepare("SELECT order_id FROM payment_attempts WHERE idempotency_key = ?").bind(input.idempotencyKey).first<{order_id:string}>();
  if(duplicate) return { orderId:duplicate.order_id, replayed:true };
  const now=new Date().toISOString();
  const statements=[
    db.prepare("INSERT INTO reservations (id,order_id,status,expires_at,created_at) VALUES (?,?, 'active',?,?)").bind(input.reservationId,input.orderId,input.expiresAt,now),
    ...input.lines.flatMap(line=>[
      db.prepare("UPDATE variants SET reserved_quantity = reserved_quantity + ? WHERE id = ? AND preorder_open = 1").bind(line.quantity,line.variantId),
      db.prepare("INSERT INTO reservation_items (reservation_id,variant_id,quantity) VALUES (?,?,?)").bind(input.reservationId,line.variantId,line.quantity),
    ]),
  ];
  await db.batch(statements);
  return {orderId:input.orderId,reservationId:input.reservationId,replayed:false};
}

export async function consumeReservation(db:D1Database,reservationId:string){
  const rows=await db.prepare("SELECT variant_id,quantity FROM reservation_items WHERE reservation_id = ?").bind(reservationId).all<{variant_id:string;quantity:number}>();
  await db.batch([
    ...rows.results.map(row=>db.prepare("UPDATE variants SET reserved_quantity = reserved_quantity - ?, committed_quantity = committed_quantity + ? WHERE id = ?").bind(row.quantity,row.quantity,row.variant_id)),
    db.prepare("UPDATE reservations SET status = 'consumed' WHERE id = ? AND status = 'active'").bind(reservationId),
  ]);
}
