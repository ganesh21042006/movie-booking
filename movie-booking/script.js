/* ---------- OBSERVER ---------- */
class Show { // Subject
  #price; #taken; #obs = [];
  constructor(price, taken){ this.#price = price; this.#taken = new Set(taken); }
  get price(){ return this.#price; }
  isTaken(s){ return this.#taken.has(s); }
  subscribe(o){ if(!this.#obs.includes(o)) this.#obs.push(o); }
  unsubscribe(o){ this.#obs = this.#obs.filter(x => x !== o); }
  notify(msg){ this.#obs.forEach(o => o.update(msg)); }
  setPrice(p){
    const old = this.#price; this.#price = p;
    if(p < old) this.notify(`Price dropped from Rs.${old} to Rs.${p}`);
  }
  confirm(seats){ seats.forEach(s => this.#taken.add(s)); this.notify(`${seats.length} seat(s) just booked: ${seats.join(", ")}`); }
}
class Customer { // Observer
  constructor(name){ this.name = name; }
  update(msg){
    const ul = document.getElementById("notes");
    if(ul.firstElementChild && ul.firstElementChild.classList.contains("empty")) ul.innerHTML = "";
    const li = document.createElement("li");
    li.innerHTML = `<span class="tag"></span> `; li.firstChild.textContent = this.name;
    li.append(msg); ul.prepend(li);
  }
}

/* ---------- STRATEGY ---------- */
class CardPayment { pay(a){ return `Paid Rs.${a.toFixed(0)} by credit card ending 1234.`; } }
class UPIPayment  { pay(a){ return `Paid Rs.${a.toFixed(0)} using UPI (you@upi).`; } }
class WalletPayment {
  constructor(){ this.balance = 500; }
  pay(a){
    if(a > this.balance) throw new Error(`Wallet has Rs.${this.balance}. Choose another method.`);
    this.balance -= a; return `Paid Rs.${a.toFixed(0)} from wallet. Rs.${this.balance} left.`;
  }
}
class CheckoutService { // Context
  constructor(s){ this.strategy = s; }
  setStrategy(s){ this.strategy = s; }
  execute(a){ return this.strategy.pay(a); }
}

/* ---------- COMMAND ---------- */
class Cart { // Receiver
  constructor(show){ this.show = show; this.seats = []; this.discount = 0; }
  total(){ return this.seats.length * this.show.price * (1 - this.discount); }
}
class BookSeat { constructor(c, s){ this.c = c; this.s = s; this.label = `Select ${s}`; }
  execute(){ this.c.seats.push(this.s); } undo(){ this.c.seats = this.c.seats.filter(x => x !== this.s); } }
class CancelSeat { constructor(c, s){ this.c = c; this.s = s; this.label = `Remove ${s}`; }
  execute(){ this.c.seats = this.c.seats.filter(x => x !== this.s); } undo(){ this.c.seats.push(this.s); } }
class ApplyCoupon { constructor(c, code, pct){ this.c = c; this.pct = pct; this.prev = 0; this.label = `Coupon ${code} (${pct*100}% off)`; }
  execute(){ this.prev = this.c.discount; this.c.discount = this.pct; } undo(){ this.c.discount = this.prev; } }
class Invoker {
  constructor(){ this.done = []; this.undone = []; }
  run(cmd){ cmd.execute(); this.done.push(cmd); this.undone = []; }
  undo(){ const c = this.done.pop(); if(c){ c.undo(); this.undone.push(c); } }
  redo(){ const c = this.undone.pop(); if(c){ c.execute(); this.done.push(c); } }
  clear(){ this.done = []; this.undone = []; }
}

/* ---------- APP WIRING ---------- */
const ROWS = "ABCDEF", COLS = 8;
const show = new Show(250, ["A3","A4","B5","C1","C2","D6","D7","E4","F8"]);
const cart = new Cart(show), inv = new Invoker();
const checkout = new CheckoutService(new CardPayment()), wallet = new WalletPayment();
const asha = new Customer("Asha"), ravi = new Customer("Ravi");
const COUPONS = { CINE10: .10, FIRST20: .20 };
const $ = id => document.getElementById(id);
show.subscribe(asha);

function render(){
  $("price").textContent = "Rs." + show.price;
  $("seats").innerHTML = "";
  [...ROWS].forEach(r => {
    const row = document.createElement("div"); row.className = "row";
    row.innerHTML = `<span class="rl">${r}</span>`;
    for(let n = 1; n <= COLS; n++){
      const id = r + n, b = document.createElement("button");
      b.className = "seat" + (cart.seats.includes(id) ? " sel" : "");
      b.textContent = n; b.disabled = show.isTaken(id);
      b.setAttribute("aria-label", `Seat ${id}` + (b.disabled ? ", taken" : cart.seats.includes(id) ? ", selected" : ""));
      b.onclick = () => { inv.run(cart.seats.includes(id) ? new CancelSeat(cart, id) : new BookSeat(cart, id)); render(); };
      row.append(b);
    }
    $("seats").append(row);
  });
  $("sum").textContent = cart.seats.length ? `${cart.seats.length} seat(s): ${[...cart.seats].sort().join(", ")}` : "No seats yet";
  $("total").textContent = "Rs." + cart.total().toFixed(0);
  $("undo").disabled = !inv.done.length; $("redo").disabled = !inv.undone.length;
  $("pay").disabled = !cart.seats.length;
  const h = $("hist"); h.innerHTML = "";
  if(!inv.done.length) h.innerHTML = '<li class="empty">Pick a seat to start.</li>';
  inv.done.forEach((c, i) => { const li = document.createElement("li"); li.textContent = `${i + 1}. ${c.label}`; h.prepend(li); });
}
const msg = (id, t, cls = "") => { $(id).textContent = t; $(id).className = "msg " + cls; };

$("undo").onclick = () => { inv.undo(); render(); };
$("redo").onclick = () => { inv.redo(); render(); };
$("apply").onclick = () => {
  const code = $("coupon").value.trim().toUpperCase();
  if(!COUPONS[code]) return msg("cmsg", "That code isn’t valid. Try CINE10 or FIRST20.", "err");
  inv.run(new ApplyCoupon(cart, code, COUPONS[code]));
  msg("cmsg", `${code} applied.`, "ok"); render();
};
document.querySelectorAll('input[name=pm]').forEach(r => r.onchange = () => {
  checkout.setStrategy({ card: new CardPayment(), upi: new UPIPayment(), wallet }[r.value]);
});
$("pay").onclick = () => {
  try{
    const amt = cart.total(), seats = [...cart.seats];
    const receipt = checkout.execute(amt);
    show.confirm(seats); cart.seats = []; inv.clear();
    msg("pmsg", `Booked ${seats.join(", ")}. ${receipt}`, "ok");
  }catch(e){ msg("pmsg", e.message, "err"); }
  render();
};
$("drop").onclick = () => { if(show.price > 100) show.setPrice(show.price - 30); else msg("pmsg", "Price is already at the minimum of Rs.100.", "err"); render(); };
$("s-asha").onchange = e => e.target.checked ? show.subscribe(asha) : show.unsubscribe(asha);
$("s-ravi").onchange = e => e.target.checked ? show.subscribe(ravi) : show.unsubscribe(ravi);
render();
