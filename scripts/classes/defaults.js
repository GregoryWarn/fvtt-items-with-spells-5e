export class ItemsWithSpells5e {
  static MODULE_ID = 'items-with-spells-5e';
  static SETTINGS = {};
  static FLAGS = {
    itemSpells: 'item-spells',
    parentItem: 'parent-item',
    knownUuid: 'original-uuid'
  };
  static TEMPLATES = {
    spellsTab: `modules/${ItemsWithSpells5e.MODULE_ID}/templates/spells-tab.hbs`,
    overrides: `modules/${ItemsWithSpells5e.MODULE_ID}/templates/overrides-form.hbs`
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
    return spell.getFlag(ItemsWithSpells5e.MODULE_ID, ItemsWithSpells5e.FLAGS.parentItem) ?? null;
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
    if (embeddedOnly && !spell.isEmbedded) return null;
    const parentId = ItemsWithSpells5e.getSpellParentId(spell);
    if (!parentId) return null;
    const items = providedItems ?? spell.actor?.items ?? false;
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
    if (item.system?.identified === false) return false;
    // Unusable if item is not equipped and setting set to exclude based unequipped
    const iwsExcludeUnequipped = game.settings.get(ItemsWithSpells5e.MODULE_ID, "excludeUnequipped");
    if (iwsExcludeUnequipped && item.system.equipped === false) return false;
    // Unusable if item is not attuned (but still show to GM)
    if (!game.user.isGM) {
      if (foundry.utils.isNewerVersion(game.system.version, "3.1.99")) {
        const attunementRequired = item.system?.attunement === "required";
        if (attunementRequired && !item.system?.attuned) return false;
      } else {
        const attunementRequired = CONFIG.DND5E.attunementTypes?.REQUIRED ?? 1;
        if (item.system?.attunement === attunementRequired) return false;
      }
    }
    return true;
  }
}