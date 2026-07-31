'use strict';

// The order-lifecycle status vocabulary shared by the schema (CHECK
// constraints), the order/status-timeline services, and the customer-facing
// confirmation and status screens. This is the single source of truth for
// these status strings; it is distinct from the payment/activation vocabulary
// in src/status.js.

// An order is created PENDING (awaiting payment/provider confirmation), moves
// to CONFIRMED once payment succeeds, proceeds to ACTIVATING while fulfilment
// and activation run, and ends in a terminal FAILED state on error.
const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  ACTIVATING: 'ACTIVATING',
  FAILED: 'FAILED',
});

const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUS));

function isValidOrderStatus(value) {
  return ORDER_STATUS_VALUES.includes(value);
}

// The next-expected fulfilment/activation step for each order status, together
// with the user-facing message surfaced on the confirmation / status-timeline
// screens. `async` is true for states where fulfilment or activation continues
// in the background — the customer waits / polls rather than taking immediate
// action (PENDING awaiting payment confirmation, ACTIVATING while activation
// is in progress).
const ORDER_NEXT_STEPS = Object.freeze({
  PENDING: Object.freeze({
    step: 'AWAIT_PAYMENT_CONFIRMATION',
    message: 'We are waiting for your payment to be confirmed. This can take a few moments.',
    async: true,
  }),
  CONFIRMED: Object.freeze({
    step: 'BEGIN_ACTIVATION',
    message: 'Payment confirmed. Your order is ready and activation will begin shortly.',
    async: false,
  }),
  ACTIVATING: Object.freeze({
    step: 'AWAIT_ACTIVATION_COMPLETION',
    message: 'Activation is in progress. We will let you know as soon as your service is ready.',
    async: true,
  }),
  FAILED: Object.freeze({
    step: 'RESOLVE_FAILURE',
    message: 'Something went wrong with your order. Please review the details and try again.',
    async: false,
  }),
});

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  isValidOrderStatus,
  ORDER_NEXT_STEPS,
};
