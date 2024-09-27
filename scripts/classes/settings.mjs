import {ItemsWithSpells5e as IWS} from './defaults.js';

// the item types that can NEVER have spells in them.
export const EXCLUDED_TYPES = [
  "class",
  "subclass",
  "background",
  "race",
  "lineage",
  "spell",
  "base",
  "container",
  "backpack"
];

export function _registerSettings() {
  const TYPES = Item.TYPES.filter(t => !EXCLUDED_TYPES.includes(t));

  for (const type of TYPES) {
    game.settings.register(IWS.MODULE_ID, `isIncludedItemType${type.titleCase()}`, {
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      requiresReload: true
    });
  }

  game.settings.register(IWS.MODULE_ID, "sortOrder", {
    name: "IWS.SETTINGS.SORT_ORDER.NAME",
    hint: "IWS.SETTINGS.SORT_ORDER.HINT",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false
  });

  game.settings.registerMenu(IWS.MODULE_ID, "itemTypeExclusion", {
    name: "IWS.SETTINGS.ITEM_EXCLUSION.NAME",
    hint: "IWS.SETTINGS.ITEM_EXCLUSION.HINT",
    scope: "world",
    config: true,
    type: IWS_TypeSettings,
    label: "IWS.SETTINGS.ITEM_EXCLUSION.NAME",
    restricted: true
  });

  game.settings.register(IWS.MODULE_ID, "excludeUnequipped", {
    name: "IWS.SETTINGS.EXCLUDE_UNEQUIPPED.NAME",
    hint: "IWS.SETTINGS.EXCLUDE_UNEQUIPPED.HINT",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });
}

class IWS_TypeSettings extends FormApplication {

  get id() {
    return `${IWS.MODULE_ID}-item-type-exclusion-menu`;
  }

  get title() {
    return game.i18n.localize("IWS.SETTINGS.ITEM_EXCLUSION.TITLE");
  }

  get template() {
    return "modules/items-with-spells-5e/templates/settingsMenu.hbs";
  }

  async getData() {
    const TYPES = Item.TYPES.filter(t => !EXCLUDED_TYPES.includes(t));
    const data = await super.getData();
    data.types = [];
    for (const type of TYPES) {
      data.types.push({
        checked: game.settings.get(IWS.MODULE_ID, `isIncludedItemType${label}`),
        value: type,
        label: game.i18n.localize(`TYPES.Item.${type}`)
      });
    }
    return data.sort((a,b) => (a.label > b.label) ? 1 : (a.label < b.label) ? -1 : 0);
  }

  async _updateObject(event, formData) {
    Object.entries(formData).forEach(([type, bool]) => {
      game.settings.set(IWS.MODULE_ID, `isIncludedItemType${type.titleCase()}`, bool);
    });
  }
}
