# Simple payment decision guide

This is a comparison and an owner-only saved preference, not a processor connection. Main choices are current JMS manual recording (easiest today), compatible-phone Square payments (recommended if phone payments are the priority), and a possible JMS terminal link (requires model/vendor verification). Stripe Terminal is under More options because native-app development adds work. Existing detailed provider preferences and terminal identification are collapsed to keep the first view simple.

Saving `payment_plan` preserves the saved provider, channel, methods, and terminal notes. Choosing a card alone does not save. It never enables processing, changes prices, adds a customer fee, creates an account, agrees to terms, or changes revenue/payroll. Non-owner managers see the same generic comparison without fetching saved settings or receiving selection/save controls.

There is no verified cheapest choice until the existing merchant agreement, eligibility, payment types and extra costs are known. The Square card plainly notes possible fee savings, with a clearly hypothetical example: 3.24% versus eligible 2.5% differs by 0.74 percentage points, or ¥740 per ¥100,000 before other costs. Neither rate is assumed to be the bar's contract. Hardware, printer, monthly and development costs can change the comparison.

Official references reviewed 2026-11-01:
- [Square Japan Tap to Pay: conditional 2.5%, otherwise 3.25%+ / custom](https://squareup.com/jp/ja/payments/tap-to-pay).
- [Square Japan Android compatibility](https://squareup.com/jp/ja/payments/tap-to-pay-android).
- [Square POS API overview](https://developer.squareup.com/docs/pos-api/what-it-does) and [testing](https://developer.squareup.com/docs/devtools/sandbox/overview).
- [Stripe Japan pricing: Terminal 3.24% plus ¥18 per Tap authorization](https://stripe.com/jp/pricing).
- [Stripe Terminal Japan public preview and native app requirements](https://support.stripe.com/questions/terminal-in-japan).
- [JMS terminal catalog](https://www.japanmerchantservices.com/lp/004/terminal/).

Customer taps on a payment terminal and merchant-phone-as-reader payment apps are different paths. Neither generic browser NFC nor a phone-to-JMS receipt-printer bridge is implemented. Receipt support and exact device/payment limits require verification. No live tests are performed; later live activation/testing requires separate approval, especially because the Square POS API does not offer a complete Sandbox workflow.
