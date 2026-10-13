// B2B email copy (companies, quotes, net terms), merged into emails.ts STR. `ref` = short quote ref.
export type B2bData = {
  ref?: string
  company_name?: string
  body?: string | null
  note?: string | null
  url?: string
  due_date?: string
}
type D = B2bData & { display_id: number | string }
type Copy = { subject: (d: D) => string; intro: string }

export const B2B_STR: Record<"en" | "ar", Record<B2bTemplate, Copy> & Record<"company" | "message" | "note" | "due" | "open" | "accept", string>> = {
  en: {
    company: "Company", message: "Message", note: "Note", due: "Due date", open: "Open", accept: "Accept invitation",
    "company-invite": { subject: (d) => `Join ${d.company_name} on iCommerce`, intro: "You were invited to buy for this company: request quotes, see wholesale prices and order on the company's terms." },
    "company-verified": { subject: (d) => `${d.company_name} is verified`, intro: "Your company is verified. Members now see wholesale prices and can request quotes." },
    "company-rejected": { subject: (d) => `${d.company_name}: verification needs attention`, intro: "We couldn't verify your company. Please read the note below and resubmit your documents." },
    "quote-requested": { subject: (d) => `New quote request ${d.ref}`, intro: "A company requested a quote. Open the vendor portal to review it and make an offer." },
    "quote-offered": { subject: (d) => `Offer received for ${d.ref}`, intro: "The supplier sent an offer. Review prices, lead time and validity, then accept, counter or decline." },
    "quote-countered": { subject: (d) => `Counter-offer on ${d.ref}`, intro: "The buyer replied with a counter-offer. Review their target prices and send a new offer." },
    "quote-message": { subject: (d) => `New message on ${d.ref}`, intro: "There is a new message on this quote." },
    "quote-pending-approval": { subject: (d) => `Approval needed: ${d.ref}`, intro: "A buyer accepted this offer. An approver or company admin must approve it before the order is placed." },
    "quote-accepted": { subject: (d) => `Quote ${d.ref} accepted, order placed`, intro: "The offer was accepted and an order was created." },
    "quote-rejected": { subject: (d) => `Quote ${d.ref} declined`, intro: "This quote was declined." },
    "quote-expired": { subject: (d) => `Quote ${d.ref} expired`, intro: "The offer's validity date passed. Request a new quote if you still need these items." },
    "invoice-overdue": { subject: (d) => `Invoice for order #${d.display_id} is overdue`, intro: "This invoice is past its due date. Ordering on net terms is on hold until it is paid." },
  },
  ar: {
    company: "الشركة", message: "الرسالة", note: "ملاحظة", due: "تاريخ الاستحقاق", open: "فتح", accept: "قبول الدعوة",
    "company-invite": { subject: (d) => `انضم إلى ${d.company_name} على iCommerce`, intro: "تمت دعوتك للشراء باسم هذه الشركة: اطلب عروض الأسعار، واطّلع على أسعار الجملة، واطلب وفق شروط الشركة." },
    "company-verified": { subject: (d) => `تم توثيق ${d.company_name}`, intro: "تم توثيق شركتك. يرى الأعضاء الآن أسعار الجملة ويمكنهم طلب عروض الأسعار." },
    "company-rejected": { subject: (d) => `${d.company_name}: التوثيق يحتاج إلى مراجعة`, intro: "تعذّر توثيق شركتك. يرجى قراءة الملاحظة أدناه وإعادة إرسال المستندات." },
    "quote-requested": { subject: (d) => `طلب عرض سعر جديد ${d.ref}`, intro: "طلبت إحدى الشركات عرض سعر. افتح بوابة البائع لمراجعته وتقديم عرض." },
    "quote-offered": { subject: (d) => `وصل عرض على ${d.ref}`, intro: "أرسل المورّد عرضًا. راجع الأسعار ومدة التوريد والصلاحية، ثم اقبل أو قدّم عرضًا مضادًا أو ارفض." },
    "quote-countered": { subject: (d) => `عرض مضاد على ${d.ref}`, intro: "ردّ المشتري بعرض مضاد. راجع الأسعار المستهدفة وأرسل عرضًا جديدًا." },
    "quote-message": { subject: (d) => `رسالة جديدة على ${d.ref}`, intro: "توجد رسالة جديدة على عرض السعر هذا." },
    "quote-pending-approval": { subject: (d) => `مطلوب اعتماد: ${d.ref}`, intro: "قبل أحد المشترين هذا العرض. يجب أن يعتمده معتمِد أو مسؤول الشركة قبل إنشاء الطلب." },
    "quote-accepted": { subject: (d) => `تم قبول عرض السعر ${d.ref} وإنشاء الطلب`, intro: "تم قبول العرض وإنشاء طلب." },
    "quote-rejected": { subject: (d) => `تم رفض عرض السعر ${d.ref}`, intro: "تم رفض عرض السعر هذا." },
    "quote-expired": { subject: (d) => `انتهت صلاحية عرض السعر ${d.ref}`, intro: "انتهى تاريخ صلاحية العرض. اطلب عرض سعر جديدًا إذا كنت لا تزال تحتاج هذه المنتجات." },
    "invoice-overdue": { subject: (d) => `فاتورة الطلب رقم ${d.display_id} متأخرة`, intro: "تجاوزت هذه الفاتورة تاريخ استحقاقها. الشراء بالآجل متوقف حتى سدادها." },
  },
}

export type B2bTemplate =
  | "company-invite" | "company-verified" | "company-rejected"
  | "quote-requested" | "quote-offered" | "quote-countered" | "quote-message" | "quote-pending-approval"
  | "quote-accepted" | "quote-rejected" | "quote-expired" | "invoice-overdue"
