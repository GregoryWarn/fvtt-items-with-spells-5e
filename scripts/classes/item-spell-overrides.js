import {ItemsWithSpells5e as IWS} from './defaults.js';

/**
 * The form to control Item Spell overrides (e.g. for consumption logic)
 */
export class ItemsWithSpells5eItemSpellOverrides extends FormApplication {
  constructor(itemWithSpellsItem, itemSpellId) {
    const itemSpellFlagData = itemWithSpellsItem.itemSpellFlagMap.get(itemSpellId);
    // set the `object` of this FormApplication as the itemSpell data from the parent item's flags
    super(itemSpellFlagData?.changes ?? {});

    // the spell we are editing
    this.itemSpellId = itemSpellId;

    // the ItemsWithSpells5eItem instance to use
    this.itemWithSpellsItem = itemWithSpellsItem;

    // the parent item
    this.item = itemWithSpellsItem.item;

    // the fake or real spell item
    this.itemSpellItem = itemWithSpellsItem.itemSpellItemMap.get(itemSpellId);
  }

  get id() {
    return `${IWS.MODULE_ID}-${this.item.id}-${this.itemSpellItem.id}`;
  }

  get title() {
    return `${this.item.name} - ${this.itemSpellItem.name}`;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['dnd5e', 'sheet', 'item', "iws"],
      template: IWS.TEMPLATES.overrides,
      width: 560,
      closeOnSubmit: false,
      submitOnChange: true,
      height: 'auto'
    });
  }

  getData() {
    const uses = this.item.system.uses || {};
    const overrides = this.object;
    if (overrides.system?.attackBonus) {
      overrides.system = foundry.utils.mergeObject(overrides.system, {['attack.bonus']: overrides.system.attackBonus});
    }
    const ret = {
      hasAttack: this.itemSpellItem.hasAttack,
      hasSave: this.itemSpellItem.hasSave,
      save: this.itemSpellItem.system.save,
      overrides,
      config: {
        limitedUsePeriods: CONFIG.DND5E.limitedUsePeriods,
        abilities: CONFIG.DND5E.abilities,
        spellLevels: CONFIG.DND5E.spellLevels,
        // Temporary custom object to use selectOptions until DnD5e gets v12 compliant
        saveScaling: {
          "spell": { label: "DND5E.Spellcasting" },
          ...CONFIG.DND5E.abilities,
          "flat": { label: "DND5E.Flat" }
        }
      },
      isFlatDC: overrides?.system?.save?.scaling === 'flat',
      spell: this.itemSpellItem,
      parentItem: {
        id: this.item.id,
        name: this.item.name,
        isEmbedded: this.item.isEmbedded,
        hasUses: this.item.hasLimitedUses && (uses.per in CONFIG.DND5E.limitedUsePeriods) && (uses.max > 0)
      }
    };
    return ret;
  }

  async _updateObject(event, formData) {
    const formDataExpanded = foundry.utils.expandObject(formData);
    this.object = formDataExpanded.overrides;
    if (event instanceof SubmitEvent) {
      // Button pressed to save and close the form
      await this.itemWithSpellsItem.updateItemSpellOverrides(this.itemSpellId, this.object);
      this.close();
    } else {
      // Update the form to reflect the change
      this.render();
    }
  }
}
