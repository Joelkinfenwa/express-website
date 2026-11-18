// Prices invoiced to partners at month end for orders that come through Shopify at $0 (100% discount
// or the ordering API). Matched against the line item title (case-insensitive, contains). Titles not
// listed use the line item's original Shopify price.
export default {
  'Primal Zone': {
    'Initial Panel': 220
  }
};

// Partners whose jobs are added by hand in the tracker and invoiced at month end. Unit prices exclude GST.
export const JOB_PARTNERS = {
  MIRAIT: { unit: 235, gst: true, item: 'Lead test' }
};
