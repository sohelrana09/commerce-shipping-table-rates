/**
 * Registers the app's shipping carrier with Commerce's Out-of-Process Shipping Methods module
 * (REST /V1/oope_shipping_carrier). Commerce shows webhook methods at checkout only for carriers
 * it knows about, so installation creates or updates the carrier and uninstallation switches it
 * off (it's kept, so past orders still name it).
 */

const PATH = "oope_shipping_carrier";

export function carrierPayload(settings, active = true) {
  return {
    carrier: {
      active,
      code: settings.carrierCode,
      shipping_labels_available: false,
      sort_order: 10,
      title: settings.carrierTitle,
      tracking_available: false,
    },
  };
}

/** Creates the carrier, or updates it when it already exists. */
export async function upsertCarrier(
  commerce,
  settings,
  { active = true } = {},
) {
  const json = carrierPayload(settings, active);
  try {
    await commerce.post(PATH, { json }).json();
    return "created";
  } catch (createError) {
    try {
      await commerce.put(PATH, { json }).json();
      return "updated";
    } catch (updateError) {
      throw new Error(
        `Couldn't register carrier "${settings.carrierCode}": ${createError.message}`,
        { cause: updateError },
      );
    }
  }
}
