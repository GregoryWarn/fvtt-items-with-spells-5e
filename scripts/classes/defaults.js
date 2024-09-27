export class ItemsWithSpells5e {
  static MODULE_ID = 'items-with-spells-5e';
  static SETTINGS = {};
  static FLAGS = {
    itemSpells: 'item-spells',
    parentItem: 'parent-item',
    knownUuid: 'original-uuid'
  };
  static TEMPLATES = {
    spellsTabNew: `modules/${ItemsWithSpells5e.MODULE_ID}/templates/spells-tab-new.hbs`,
    spellsTab: `modules/${ItemsWithSpells5e.MODULE_ID}/templates/spells-tab.hbs`,
    overrides: `modules/${ItemsWithSpells5e.MODULE_ID}/templates/overrides-form.hbs`
  };
  static VERSIONS = {
    get DnD5e_v4() { return foundry.utils.isNewerVersion(game.system.version, '4'); }
  };

  static init() {
    ItemsWithSpells5e.preloadTemplates();
  }

  static preloadTemplates() {
    dnd5e.utils.registerHandlebarsHelpers();
    loadTemplates(ItemsWithSpells5e.TEMPLATES);
  }

  /**
   * Test if an item is an items-with-spells-5e item
   * @public
   * @param {Item5e[]} item The item to get the attached spells from
   * @returns the object with the spells
   */
  static isIwsItem(item) {
    if (typeof item === 'string') item = fromUuidSync(item);
    const itemSpells = item?.getFlag(ItemsWithSpells5e.MODULE_ID, ItemsWithSpells5e.FLAGS.itemSpells) ?? [];
    return itemSpells.length ? itemSpells : null;
  }

  /**
   * Test if a spell has a parent item by seeing if a parent id is set
   * @public
   * @param {Item5e[]} spell The spell with a parent item
   * @returns the parent item id or `null` if no parent item is found
   * `isIwsSpell` exposed in the api as alias for this
   */
  static getSpellParentId(spell) {
    if (typeof spell === 'string') spell = fromUuidSync(spell);
    return spell?.getFlag(ItemsWithSpells5e.MODULE_ID, ItemsWithSpells5e.FLAGS.parentItem) ?? null;
  }

  /**
   * Get the parent item of a spell on the same actor
   * @public
   * @param {Item5e[]} spell The spell to get the parent item of
   * @param {boolean} embeddedOnly Only return the item if owned by an actor
   * @param {Map} providedItems Only return spells included in these items (e.g. pass actor.items)
   * @returns the parent item or `null` if spell has no parent or parent is not owned by the same actor
   */
  static async getSpellParentItem(spell, embeddedOnly = false, providedItems = false) {
    if (typeof spell === 'string') spell = await fromUuid(spell);
    if (embeddedOnly && !spell?.isEmbedded) return null;
    const parentId = ItemsWithSpells5e.getSpellParentId(spell);
    if (!parentId) return null;
    const items = providedItems ?? spell?.actor?.items ?? false;
    if (embeddedOnly && !items) {
      return null;
    } else if (items) {
      const parentIdLast = parentId.split('.').pop();
      return items.get(parentIdLast) ?? null;
    } else {
      return await fromUuid(parentId);
    }
  }

  /**
   * Test if a type of item is enabled to have the spells tab from items-with-spells-5e
   * @public
   * @param {string} itemType The spell with a parent item
   * @returns {boolean} true if spells tab should be visible
   */
  static isIncludedItemType(itemType) {
    let include = false;
    try {
      include = !!game.settings.get(
        ItemsWithSpells5e.MODULE_ID,
        `isIncludedItemType${itemType.titleCase()}`
      );
    } catch {}
    return include;
  }

  /**
   * Test if the spells of an item should be shown (item is attuned, equipped, identified)
   * @public
   * @param {Item5e[]} item The parent item of the spell(s)
   * @returns {boolean} true if item should be shown
   */
  static isUsableItem(item) {
    if (typeof item === 'string') item = fromUuidSync(item);
    // Unusable if item is not identified
    if (item?.system?.identified === false) return false;
    // Unusable if item is not equipped and setting set to exclude based unequipped
    const iwsExcludeUnequipped = game.settings.get(ItemsWithSpells5e.MODULE_ID, "excludeUnequipped");
    if (iwsExcludeUnequipped && item?.system.equipped === false) return false;
    // Unusable if item is not attuned (but still show to GM)
    if (!game.user.isGM) {
      if (foundry.utils.isNewerVersion(game.system.version, "3.1.99")) {
        const attunementRequired = item?.system?.attunement === "required";
        if (attunementRequired && !item?.system?.attuned) return false;
      } else {
        const attunementRequired = CONFIG.DND5E.attunementTypes?.REQUIRED ?? 1;
        if (item?.system?.attunement === attunementRequired) return false;
      }
    }
    return true;
  }

  /**
   * Update the flags of an item with spells from DnD5e v3.x to v4.x
   * @public
   * @param {Item5e} item The item with the item with spells flags
   * @returns {Item5e} the item with fixed flags
   */
  static async updateFlagsToV4(item) {
    const itemSpellList = ItemsWithSpells5e.isIwsItem(item);
    const oldType = itemSpellList?.some(s => s.changes);

    if (oldType) {
      const newItemSpells = itemSpellList.map(s => {
        if (s.changes) {
          s.overrides = ItemsWithSpells5e.updateChangesToV4(s.changes);
          delete s.changes;
        }
        return s;
      });
      await item.update({[`flags.${ItemsWithSpells5e.MODULE_ID}.${ItemsWithSpells5e.FLAGS.itemSpells}`]: newItemSpells}, {render: false});
    }

    return item;
  }

  /**
   * Update the old (DnD5e v3.x) changes object to the new overrides object (DnD5e v4.x)
   * @public
   * @param {object} changes The changes object stored in the IWS flag
   */
  static updateChangesToV4(changes) {
    changes = foundry.utils.expandObject(changes);
    const overrides = {};

    // Limited inherit uses
    if (changes.system?.uses?.max) {
      overrides['uses.max'] = changes.system.uses.max
    }
    if (changes.system?.uses?.per) {
      // system.uses.per "charges" option no longer exist (change to no recovery)
      if (changes.system.uses.per === "charges") changes.system.uses.per = "";
      overrides['uses.recovery'] = changes.system.uses.per;
    }

    // Consume charges from parent item
    if (changes.system?.consume?.amount) {
      overrides['consumption.value'] = changes.system.consume.amount;
    }
    if (changes.system?.consume?.scale) {
      overrides['consumption.scaling'] = changes.system.consume.scale;
    }

    // Save
    if (changes.system?.save?.scaling) {
      switch(changes.system.save.scaling) {
        case "spell":
          // "spell" option is now "spellcasting"
          changes.system.save.scaling = "spellcasting";
          break;
        case "flat":
          // "flat" option is now ""
          changes.system.save.scaling = "";
          break;
      }
      overrides['saveActivity.calculation'] = changes.system.save.scaling;
    }
    if (changes.system?.save?.dc) {
      overrides['saveActivity.formula'] = changes.system.save.dc;
    }

    // Attack
    if (changes.system?.attack?.bonus || changes.system?.attackBonus) {
      overrides['attackActivity.bonus'] = changes.system?.attack?.bonus ?? changes.system?.attackBonus;
      overrides['attackActivity.flat'] = true;
    }

    return foundry.utils.expandObject(overrides);
  }

  /**
   * Create an object that can be used to update a spell's data
   * @public
   * @param {Item5e} parentItem The item that owns the spell
   * @param {Item5e} spell      The spell object to merge the overrides unto
   * @param {object} overrides  The overrides object stored in the IWS flag
   */
  static createUpdateObject(parentItem, spell, overrides = {}) {
    /*-- Create the update object --*/
    // Starting with some defaults that we need to always set
    const update = {
      // a flag to point to the parentItem's ID
      [`flags.${ItemsWithSpells5e.MODULE_ID}.${ItemsWithSpells5e.FLAGS.parentItem}`]: parentItem.id,
      // preparation mode to 'atwill'
      'system.preparation.mode': 'atwill',
      // empty the spent uses
      'system.uses.spent': null
    };

    // Make sure this doesn't have anything set for its Tidy 5e section
    const tidy5eSectionFlag = spell.flags['tidy5e-sheet']?.section;
    if (tidy5eSectionFlag) {
      update['flags.tidy5e-sheet.section'] = null;
    }

    /*-- Convert the overrides object into a useable update object --*/
    // Limited inherit uses
    if (overrides.uses?.max) {
      update['system.uses.max'] = overrides.uses.max;
      if (overrides.uses.recovery) {
        update['system.uses.recovery'] = [{ period: overrides.uses.recovery }];
      } else {
        update['system.uses.recovery'] = null;
      }
    }

    // Create object for the charges consumed from parent item
    const consumptionTargets = !overrides.consumption?.value ? false : [{
      type: "itemUses",
      value: overrides.consumption.value,
      target: parentItem.id,
      scaling: { "mode": overrides.consumption.scaling ? "amount" : "" }
    }];

    // Loop over all activities
    for (const activity of spell.system.activities.values()) {
      const actId = activity.id;

      // Disable using a spell slot on cast
      update[`system.activities.${actId}.consumption.spellSlot`] = false;

      // Set charges consumed from parent item
      if (consumptionTargets) {
        update[`system.activities.${actId}.consumption.targets`] = consumptionTargets;
      }

      // Set save
      if (activity.type === 'save' && overrides.saveActivity && overrides.saveActivity?.calculation !== 'noOverride') {
        update[`system.activities.${actId}.save.dc.calculation`] = overrides.saveActivity.calculation;
        if (overrides.saveActivity.calculation === '' && overrides.saveActivity?.formula) {
          update[`system.activities.${actId}.save.dc.formula`] = overrides.saveActivity.formula;
        }
      }

      // Set attack
      if (activity.type === 'attack' && overrides.attackActivity) {
        if (overrides.attackActivity.ability !== 'noOverride') {
          update[`system.activities.${actId}.attack.ability`] = overrides.attackActivity.ability;
        }
        if (overrides.attackActivity.bonus) {
          update[`system.activities.${actId}.attack.bonus`] = overrides.attackActivity.bonus;
        }
        if (overrides.attackActivity.flat) {
          update[`system.activities.${actId}.attack.flat`] = overrides.attackActivity.flat;
        }
      }
    }

    return update;
  }
}