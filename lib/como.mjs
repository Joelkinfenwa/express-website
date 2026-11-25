// Como Wellness — live ordering at expresspathology.com.au/como. Clients pay by card at checkout.
// Panel composition and prices are slotted in here when finalised with the Como clinical team;
// while any price is null the order endpoint refuses with "ordering opens shortly".
export const COMO = {
  clinic: 'Como Wellness',
  partner: 'COMO',
  homeFee: 75,
  panels: {
    baseline: { n: 'Como Baseline', p: null, fasting: true,
      lines: ['Full Blood Count', 'Kidney, liver & electrolytes', 'Fasting glucose', 'HbA1c', 'Full lipid profile', 'CRP (high sensitivity)', 'TSH', 'Iron studies', 'Vitamin D'] },
    protocol: { n: 'Peptide Protocol Panel', p: null, fasting: true,
      lines: ['Full Blood Count', 'Kidney, liver & electrolytes', 'Fasting glucose', 'HbA1c', 'Full lipid profile', 'CRP (high sensitivity)', 'TSH', 'Iron studies', 'Vitamin D', 'Lipase', 'Amylase', 'IGF-1', 'Fasting insulin', 'Testosterone + SHBG', 'Oestradiol (E2)', 'Free T3, Free T4'] },
    complete: { n: 'Como Complete', p: null, fasting: true,
      lines: ['Full Blood Count', 'Kidney, liver & electrolytes', 'Fasting glucose', 'HbA1c', 'Full lipid profile', 'CRP (high sensitivity)', 'TSH', 'Iron studies', 'Vitamin D', 'Lipase', 'Amylase', 'IGF-1', 'Fasting insulin', 'Testosterone + SHBG', 'Oestradiol (E2)', 'Free T3, Free T4', 'Morning cortisol', 'DHEA-S', 'LH, FSH', 'Prolactin', 'Vitamin B12', 'Folate', 'Homocysteine', 'Magnesium', 'Zinc', 'LDH', 'Creatine kinase'] }
  }
};
