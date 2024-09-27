import {ItemsWithSpells5e as IWS} from './defaults.js';

/**
 * A class made to make managing the operations for an Actor.
 */
export class ItemsWithSpells5eActor {
  /* Set up the create/delete Item hooks. */
  static init() {
    Hooks.on('createItem', ItemsWithSpells5eActor.handleCreateItem);
    Hooks.on('deleteItem', ItemsWithSpells5eActor.handleDeleteItem);
  }

  /**
   * When an item is deleted from an actor, find any of its child spells and prompt for those to be deleted.
   * @param {Item5e} itemDeleted            The parent item that was deleted.
   * @param {object} options                Deletion options.
   * @param {string} userId                 The id of the user who performed the deletion.
   * @returns {Promise<Item5e[]|void>}      The deleted spells.
   */
  static async handleDeleteItem(itemDeleted, options, userId) {
    if (userId !== game.user.id) return;
    if (!(itemDeleted.parent instanceof Actor)) return;
    if (["group", "vehicle"].includes(itemDeleted.parent.type)) return;

    const ids = IWS.isIwsItem(itemDeleted);
    if (!ids) return;

    const spellIds = itemDeleted.actor.items.reduce((acc, item) => {
      const flag = IWS.getSpellParentId(item);
      if ([itemDeleted.id, itemDeleted.uuid].includes(flag)) acc.push(item.id);// check uuid, too, for backwards compat.
      return acc;
    }, []);

    if (!spellIds.length) return;

    // Ask the player to confirm spell deletion, unless the option for this is set, or unless the item is unidentified and the player doesn't know spells are attached (always ask for GM)
    const optionOverride = options.itemsWithSpells5e?.alsoDeleteChildSpells;
    const autoConfirm = !game.user.isGM && itemDeleted.system?.identified === false;
    const confirm = optionOverride ?? autoConfirm ? true : await Dialog.confirm({
      title: game.i18n.localize("IWS.MODULE_NAME"),
      content: game.i18n.localize("IWS.QUERY_ALSO_DELETE")
    });
    if (confirm) return itemDeleted.actor.deleteEmbeddedDocuments("Item", spellIds);
  }

  /**
   * When an item is created on an actor, if it has any spells to add, create those, and save
   * a reference to their uuids and ids in the parent item within `flags.<module>.item-spells`.
   * Each added spell also gets `flags.<module>.parent-item` being the parent item's id.
   * @param {Item5e} itemCreated      The item with spells that was created.
   * @param {object} options          Creation options.
   * @param {string} userId           The id of the user creating the item.
   * @returns {Promise<Item5e>}       The parent item updated with new flag data.
   */
  static async handleCreateItem(itemCreated, options, userId) {
    if (userId !== game.user.id) return;
    if (!(itemCreated.parent instanceof Actor)) return;
    if (["group", "vehicle"].includes(itemCreated.parent.type)) return;

    // bail out from creating the spells if the parent item is not valid.
    const include = IWS.isIncludedItemType(itemCreated.type);
    if (!include) return;

    // Get array of objects with uuids of spells to create.
    const spellUuids = IWS.isIwsItem(itemCreated);
    if (!spellUuids) return;

    // Create the spells from this item.
    const spells = await Promise.all(spellUuids.map(d => ItemsWithSpells5eActor._createSpellData(itemCreated, d)));

    // While filtering spells, create array with override objects, matching spellData index
    const overridesData = [];
    const spellData = spells.filter((s, idx) => s ? overridesData.push(spellUuids[idx]?.changes) : false);

    // Add the spells to the actor
    const spellsCreated = await itemCreated.actor.createEmbeddedDocuments("Item", spellData);

    // Keep the changes settings for each spell in case the item is ever put back into the sidebar
    const ids = spellsCreated.map((s, idx) => ({uuid: s.uuid, id: s.id, changes: overridesData[idx]}));
    return itemCreated.setFlag(IWS.MODULE_ID, IWS.FLAGS.itemSpells, ids);
  }

  /**
   * Create the data for a spell with attack bonus, limited uses, references, and overrides.
   * @param {Item5e} parentItem     The item that has spells.
   * @param {object} data           Object with uuid and overrides.
   * @returns {Promise<object>}     The item data for creation of a spell.
   */
  static async _createSpellData(parentItem, data) {
    const spell = await fromUuid(data.uuid);
    if (!spell) return null;

    // Adjust attack bonus.
    const changes = data.changes?.system || {};
    if (changes.attackBonus && !changes.attack) {
      changes.attack = {
        bonus: changes.attackBonus,
        flat: true
      }
    } else if (changes.attack?.bonus) {
      changes.attack.flat = true;
    }

    // Adjust limited uses.
    const usesMax = changes.uses?.max;
    if (usesMax) {
      const rollData = parentItem.getRollData({deterministic: true});
      changes.uses.value = dnd5e.utils.simplifyBonus(usesMax, rollData);
    }

    // Adjust item id for consumption.
    if (changes.consume?.amount) {
      changes.consume.type = "charges";
      changes.consume.target = parentItem.id;
    }

    // Create and return spell data.
    const spellData = game.items.fromCompendium(spell);
    const mergeData = {
      [`flags.${IWS.MODULE_ID}.${IWS.FLAGS.parentItem}`]: parentItem.id,
      system: {...changes, "preparation.mode": "atwill"}
    };
    const tidy5eSectionFlag = spell.flags['tidy5e-sheet']?.section;
    if (tidy5eSectionFlag) {
      mergeData['flags.tidy5e-sheet.section'] = null;
    }
    return foundry.utils.mergeObject(spellData, mergeData);
  }
}
