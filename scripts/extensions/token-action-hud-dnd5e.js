import {ItemsWithSpells5e as IWS} from '../classes/defaults.js';
import {ItemsWithSpells5eItem as IWSitem} from '../classes/item.js';
import {EXCLUDED_TYPES} from '../classes/settings.mjs';

let ItemsWithSpellsActionHandlerExtender = null

export class ItemsWithSpells5eExtendHUD {
  static init() {
    // only if both TAH Core and DnD5e modules are installed and active
    if (!game.modules.get('token-action-hud-core')?.active || !game.modules.get('token-action-hud-dnd5e')?.active || !foundry.utils.isNewerVersion(game.modules.get('token-action-hud-dnd5e')?.version, '1.5.6')) return

    // Create the parent group
    Hooks.once("tokenActionHudCoreRegisterDefaults", async (defaults) => {
      const name = "Items with Spells"
      const spellsLayout = defaults.layout.find(obj => obj.id === 'spells')
      const newGroup = {
        id: IWS.MODULE_ID,
        name,
        listName: `Group: ${name}`,
        type: 'system',
        nestId: `spells_${IWS.MODULE_ID}`
      }
      // Add the group
      defaults.groups.push(newGroup)
      // Make it visible at the top of the Spells tab by default
      spellsLayout.groups.unshift(newGroup)
    })

    // Extend the class for making a sub-group per item and adding their spells to it
    Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
      ItemsWithSpellsActionHandlerExtender = class ItemsWithSpellsActionHandlerExtender extends coreModule.api.ActionHandlerExtender {

        constructor(actionHandler) {
          super();
          this.actionHandler = actionHandler
          this.actor = null
          this.iwsExcludeUnequipped = null
        }

        /**
         * Extend the action list
         * @override
         */
        async extendActionHandler () {
          this.actor = this.actionHandler.actor
          if (!this.actor) return

          this.iwsExcludeUnequipped = game.settings.get(IWS.MODULE_ID, "excludeUnequipped")

          const parentGroupData = {
              id: IWS.MODULE_ID,
              type: 'system'
          }

          // iterate over all the items of this actor
          for (const [key, item] of this.actor.items.entries()) {

            // skip excluded item types
            if ( EXCLUDED_TYPES.includes(item.type) ) continue

            // skip if item's spells aren't usable
            const itemUsable = IWS.isUsableItem(item)
            if ( !itemUsable ) continue

            // get spells of item
            const actionData = await IWSitem.getItemSpells(item, true, this.actor.items)
            if ( !actionData ) continue

            // Create a group for this item
            const info1 = {}
            const uses = item?.system?.uses
            if (uses?.max > 0) {
              const per = uses.recovery[0]?.period === "charges" ? "" : ` ${game.i18n.localize("DND5E.per")} `;
              const period = CONFIG.DND5E.limitedUsePeriods[uses.recovery[0]?.period]?.label ?? uses.recovery[0]?.period;
              const perPeriod = period ? `${per}${period}` : "";
              const remainingUses = uses.max - (uses.spent ?? 0);
              info1.text = `${remainingUses}/${uses.max}`;
              info1.title = `${text}${perPeriod}`;
            }
            const groupData = {
                id: `${IWS.MODULE_ID}_${item.id}`,
                name: item.name,
                type: 'system-derived',
                info1,
                defaultSelected: true,
                settings: { sort: true }
            }

            // Add group to HUD
            this.actionHandler.addGroup(groupData, parentGroupData)

            // Add actions to the group, using the TAH DnD5e Build Actions
            const actionType = 'spell'
            const data = { groupData, actionData, actionType }
            await this.actionHandler.buildActions(data)
          }
        }
      }
    })

    // Add the new class to TAH workflow
    Hooks.once("tokenActionHudCoreAddActionHandlerExtenders", async (actionHandler) => {
      actionHandler.addActionHandlerExtender(new ItemsWithSpellsActionHandlerExtender(actionHandler))
    })

  }
}
