// Empowered Through Nutrition (ETN) — live ordering at expresspathology.com.au/empowered.
// Clients pay by card at checkout (panel + optional home visit). Prices live here, server-side:
// the browser's figures are display only. Shared by api/etn-order.js and the Stripe webhook.
export const ETN = {
  clinic: 'Empowered Through Nutrition',
  partner: 'ETN',
  homeFee: 75,
  panels: {
    core: {
      n: 'Core', p: 133, fasting: false,
      lines: ['CRP (high sensitivity)', 'Full Blood Count', 'Testosterone — Total & Free + SHBG', 'Oestradiol (E2)', 'Serum Magnesium', 'MBA20 — liver, kidney, glucose, electrolytes & lipids', 'Vitamin D']
    },
    plus: {
      n: 'Plus', p: 206, fasting: false,
      lines: ['CRP (high sensitivity)', 'Full Blood Count', 'Testosterone — Total & Free + SHBG', 'Oestradiol (E2)', 'Serum Magnesium', 'MBA20 — liver, kidney, glucose, electrolytes & lipids', 'Vitamin D', 'FSH', 'LH', 'HbA1c', 'Prolactin', 'Thyroid panel — TSH, Free T3, Free T4']
    },
    ultimate: {
      n: 'Ultimate Competitive Physique', p: 327, fasting: true,
      lines: ['Full Blood Count & general blood health', 'Inflammation markers', 'Liver function', 'Kidney function', 'Lipids', 'HbA1c', 'Insulin', 'Iron studies', 'Vitamin B12', 'Folate', 'Vitamin D', 'Zinc', 'Homocysteine', 'Thyroid function', 'Cortisol', 'DHEAS', 'FSH', 'LH', 'Prolactin', 'Progesterone', 'Oestradiol (E2)', 'Testosterone + SHBG', 'IGF-1', 'Growth Hormone']
    }
  }
};
