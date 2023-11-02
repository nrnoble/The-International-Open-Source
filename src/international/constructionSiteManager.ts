import { Sleepable } from 'utils/Sleepable'
import { CollectiveManager, collectiveManager } from './collective'

/**
 * Tracks and records constructionSites and thier age, deleting old sites
 */
class ConstructionSiteManager extends Sleepable {
    run() {
        if (this.isSleepingResponsive()) return

        collectiveManager.constructionSiteCount = 0

        // Initialize uninitialized construction sites

        for (const cSiteID in Game.constructionSites) {
            // If the site's ID is stored in Memory's constructionSites, iterate
            if (Memory.constructionSites[cSiteID]) continue

            // Otherwise store it in Memory's constructionSties
            Memory.constructionSites[cSiteID] = 0
        }

        // Update and manage construction sites

        for (const cSiteID in Memory.constructionSites) {

            // Try to find the site using the recorded ID
            const cSite = Game.constructionSites[cSiteID]

            // If the site with the recorded ID doesn't exist, remove it

            if (!cSite) {
                Memory.constructionSites[cSiteID] = undefined
                continue
            }

            const cSiteAge = Memory.constructionSites[cSiteID]

            // If the site is past a certain age with respect to progress, delete it

            if (cSiteAge > 20000 + cSiteAge * cSite.progress) {
                // Remove the site from the world

                Game.constructionSites[cSiteID].remove()
                Memory.constructionSites[cSiteID] = undefined
            }

            // Otherwise increase the constructionSite's age
            Memory.constructionSites[cSiteID] += 1 * this.sleepFor

            collectiveManager.constructionSiteCount += 1
        }
    }
}

export const constructionSiteManager = new ConstructionSiteManager()
