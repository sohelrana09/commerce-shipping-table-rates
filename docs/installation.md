# Installation

Shipping Table Rates is an App Builder app. You deploy it to an App Builder workspace, then install it on a Commerce instance through App Management, which sets up the Admin menu, the settings, the database, the carrier and the shipping webhook.

## Requirements

- **Commerce:** Adobe Commerce as a Cloud Service, or Adobe Commerce 2.4.5+ on cloud infrastructure or on-premises with the Out-of-Process Shipping Methods module (`composer require magento/module-out-of-process-shipping-methods --with-dependencies`) and the webhooks module.
- **App Builder:** a project in the **same Adobe organization** as the Commerce instance. App Management only lists apps from the instance's own organization.
- **Tools:** Node.js 24 (`.nvmrc`) and the Adobe I/O CLI: `npm install -g @adobe/aio-cli`.

## App Builder project

In the [Adobe Developer Console](https://developer.adobe.com/console), create a project from the **App Builder** template. In each workspace you deploy to (for example Stage and Production), add:

| Service | Why |
|---|---|
| I/O Management API | App Management. |
| App Builder Data Services | App Builder Database Storage for the methods and rate tables. |
| OAuth Server-to-Server credential | Commerce REST (carrier registration, store views and customer groups) and database access. |

`install.yaml` lists the same APIs for the Adobe Commerce Marketplace.

## Deploy

```bash
git clone https://github.com/sohelrana09/commerce-shipping-table-rates.git
cd commerce-shipping-table-rates
npm install

aio login
aio console org select
aio console project select
aio console workspace select
aio app use --merge
cp env.dist .env

aio app deploy
```

`aio app use --merge` writes the workspace's credentials into `.env` and `.aio`. Both are git-ignored: never commit them.

To deploy from GitHub instead, set the workspace secrets the template workflows expect (`CLIENTID_STAGE`, `CLIENTSECRET_STAGE`, `TECHNICALACCID_STAGE`, `TECHNICALACCEMAIL_STAGE`, `IMSORGID_STAGE`, `SCOPES_STAGE`, `AIO_RUNTIME_NAMESPACE_STAGE`, `AIO_RUNTIME_AUTH_STAGE`, and the same with `_PROD`). Then run **Deploy to Stage** or **Deploy to Production** from the Actions tab.

## Webhook signatures

The shipping webhook accepts only requests signed by Commerce:

1. In the Commerce Admin, open **Stores → Settings → Configuration → Adobe Services → Webhooks**.
2. Under **Digital Signature Configuration**, set **Enabled** to Yes and choose **Regenerate key pair**. Save.
3. Copy the public key. You paste it into App Management during installation (**Commerce webhook public key**), or set `COMMERCE_WEBHOOK_PUBLIC_KEY` in `.env` and redeploy.

Details in [webhook.md](webhook.md#signatures).

## Install in Commerce

1. In the Commerce Admin, open **Apps → App Management**.
2. Find **Shipping Table Rates** and choose **Install**. Enter the webhook public key when asked.
3. App Management:
   - adds **Shipping Table Rates** to the Admin menu, protected by an ACL resource;
   - runs **Set up database** (`scripts/setup-database.js`): provisions the workspace's App Builder database if needed and creates the `shipping_methods` indexes;
   - runs **Register carrier** (`scripts/register-carrier.js`): creates or updates the out-of-process carrier (`tablerates`, "Table Rates") with `/V1/oope_shipping_carrier`;
   - subscribes the shipping webhook for your Commerce flavour (SaaS or PaaS).
4. Grant the Shipping Table Rates ACL resource to the admin roles that manage shipping.
5. Open **Shipping Table Rates**, start from an example or import a CSV, switch the method on, and check it with **Quote a cart**.
6. Place a test order on the storefront and check the method and price at checkout.

To use another carrier code or title, change them in **Configure** first, then run the installation again so the carrier is registered under the new code.

## Settings

In **App Management → Shipping Table Rates → Configure**:

| Setting | Default | Meaning |
|---|---|---|
| Offer table rates at checkout | On | The master switch. Off: the webhook adds no methods. |
| Carrier code | `tablerates` | The registered out-of-process carrier. Letters, digits and underscores. |
| Carrier title | Table Rates | The carrier name at checkout. |
| Weight unit | kg | Labels the Admin page. Set it to the store's weight unit; rates use weights as Commerce sends them. |
| Fallback price | empty | Offered as one method when the rate tables can't be read. Empty: offer nothing. |
| Fallback method title | Standard shipping | The fallback method's title. |

## Methods in code

To keep methods in version control instead of the Admin page, set `SHIPPING_METHODS` in `.env` to a JSON array of methods (see [rate-tables.md](rate-tables.md)) and redeploy. While it is set, the webhook uses those methods and ignores the database.

## Uninstalling

Uninstall in **Apps → App Management**. It removes the menu and the webhook, switches the carrier off, and **drops the `shipping_methods` collection**. Export the rate tables you want to keep as CSV first.

## Troubleshooting

| Symptom | Check |
|---|---|
| No table rates at checkout | The method is switched on, the master switch is on, and **Quote a cart** with the same address and items shows it. Then the carrier is registered and active (`GET /V1/oope_shipping_carrier`), and the webhook is subscribed (`GET /V1/webhooks/list`). |
| Logs say "Rejected shipping rate request" | The public key is missing or old (regenerated in Commerce), or signatures are off in Commerce. The log line says which. |
| Logs say "Skipping method" | A method in `SHIPPING_METHODS` or the database fails validation; the log gives the first problem. |
| The fallback method shows | The webhook couldn't read the methods or settings. Check `aio app logs` for "Shipping rates failed". |
| A change takes a while to show | Expected: warm containers cache the methods for 30 seconds. |
| "Not associated with a Commerce instance" in logs | The app is deployed but not installed in App Management yet. |
