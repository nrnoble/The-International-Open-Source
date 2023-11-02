import {
    WorkRequestKeys,
    CombatRequestKeys,
    containerUpkeepCost,
    customColors,
    rampartUpkeepCost,
    RemoteHarvesterRolesBySourceIndex,
    roadUpkeepCost,
    packedPosLength,
    decayCosts,
    CreepMemoryKeys,
    RoomMemoryKeys,
    RoomTypes,
} from 'international/constants'
import {
    findCarryPartsRequired,
    findLinkThroughput,
    getRangeXY,
    getRange,
    randomRange,
    roundTo,
} from 'utils/utils'
import { collectiveManager } from 'international/collective'
import { packPos, unpackPosList } from 'other/codec'
import { statsManager } from 'international/statsManager'
import { CommuneManager } from '../commune'
import { customLog } from 'utils/logging'
import { SpawnRequestArgs } from 'types/spawnRequest'

export class SpawnRequestsManager {
    communeManager: CommuneManager

    rawSpawnRequestsArgs: (SpawnRequestArgs | false)[]
    spawnEnergyCapacity: number
    minRemotePriority = 9
    /**
     * The min priority to be placed after active remotes
     */
    activeRemotePriority: number

    constructor(communeManager: CommuneManager) {
        this.communeManager = communeManager
    }

    run() {
        this.rawSpawnRequestsArgs = []
        this.spawnEnergyCapacity = this.communeManager.room.energyCapacityAvailable
        this.activeRemotePriority = this.minRemotePriority

        this.sourceHarvester()
        this.hauler()
        this.remoteSourceRoles()
        this.generalRemoteRoles()
        this.mineralHarvester()
        this.hubHauler()
        this.fastFiller()
        this.defenders()
        this.maintainers()
        this.builders()
        this.controllerUpgraders()
        this.scout()
        this.workRequestRoles()
        this.requestHauler()
        this.antifa()

        this.communeManager.spawnRequestsArgs = this.rawSpawnRequestsArgs.filter(
            args => args,
        ) as SpawnRequestArgs[]

        // Sort in descending priority

        this.communeManager.spawnRequestsArgs.sort((a, b) => {
            return a.priority - b.priority
        })
    }

    private sourceHarvester() {
        const sources = this.communeManager.room.roomManager.communeSources
        for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
            // Construct requests for sourceHarvesters

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    const role = 'sourceHarvester'
                    const spawnGroup = this.communeManager.room.creepsOfSource[sourceIndex]
                    const priority = (sourceIndex === 0 ? 0 : 1) + spawnGroup.length

                    if (this.spawnEnergyCapacity >= 850) {
                        let defaultParts: BodyPartConstant[] = [CARRY]
                        let workAmount = 6

                        // Account for power regenerating sources

                        const source = sources[sourceIndex]
                        const effect = source.effectsData.get(PWR_REGEN_SOURCE) as PowerEffect
                        if (effect) {
                            workAmount += Math.round(
                                POWER_INFO[PWR_REGEN_SOURCE].effect[effect.level - 1] /
                                    POWER_INFO[PWR_REGEN_SOURCE].period /
                                    HARVEST_POWER,
                            )
                        }

                        if (workAmount % 2 !== 0) defaultParts.push(MOVE)

                        for (let i = 1; i <= workAmount; i++) {
                            defaultParts.push(WORK)
                            if (i % 2 === 0) defaultParts.push(MOVE)
                            if (i + (1 % 5) === 0) defaultParts.push(CARRY)
                        }

                        return {
                            role,
                            defaultParts,
                            extraParts: [],
                            partsMultiplier: 1,
                            minCreeps: 1,
                            minCost: 300,
                            priority,
                            spawnGroup: spawnGroup,
                            memoryAdditions: {
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    if (this.spawnEnergyCapacity >= 800) {
                        return {
                            role,
                            defaultParts: [CARRY],
                            extraParts: [WORK, MOVE, WORK],
                            partsMultiplier: 3,
                            minCreeps: 1,
                            minCost: 250,
                            priority,
                            spawnGroup: spawnGroup,
                            memoryAdditions: {
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    if (this.spawnEnergyCapacity >= 750) {
                        return {
                            role,
                            defaultParts: [],
                            extraParts: [WORK, MOVE, WORK],
                            partsMultiplier: 3,
                            minCreeps: 1,
                            minCost: 200,
                            priority,
                            spawnGroup: spawnGroup,
                            memoryAdditions: {
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    if (this.spawnEnergyCapacity >= 600) {
                        return {
                            role,
                            defaultParts: [MOVE, CARRY],
                            extraParts: [WORK],
                            partsMultiplier: 6,
                            minCreeps: 1,
                            minCost: 300,
                            priority,
                            spawnGroup: spawnGroup,
                            memoryAdditions: {
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    if (this.spawnEnergyCapacity >= 550) {
                        return {
                            role,
                            defaultParts: [MOVE],
                            extraParts: [WORK],
                            partsMultiplier: 6,
                            minCreeps: 1,
                            minCost: 150,
                            priority,
                            spawnGroup: spawnGroup,
                            memoryAdditions: {
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    return {
                        role,
                        defaultParts: [MOVE, CARRY],
                        extraParts: [WORK],
                        partsMultiplier: 6,

                        maxCreeps: Math.min(
                            3,
                            this.communeManager.room.roomManager.communeSourceHarvestPositions[
                                sourceIndex
                            ].length,
                        ),
                        minCost: 200,
                        priority,
                        spawnGroup: spawnGroup,
                        memoryAdditions: {
                            [CreepMemoryKeys.sourceIndex]: sourceIndex,
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                })(),
            )
        }
    }

    private hauler() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                const priority = 0.5

                // Construct the required carry parts

                const partsMultiplier = this.communeManager.haulerNeed

                const role = 'hauler'

                // If all RCL 3 extensions are built

                if (this.communeManager.hasSufficientRoads) {
                    return {
                        role,
                        defaultParts: [],
                        extraParts: [CARRY, CARRY, MOVE],
                        partsMultiplier: partsMultiplier / 2,
                        minCost: 150,
                        maxCostPerCreep:
                            this.communeManager.room.memory[RoomMemoryKeys.minHaulerCost],
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                return {
                    role,
                    defaultParts: [],
                    extraParts: [CARRY, MOVE],
                    partsMultiplier,
                    minCost: 100,
                    maxCostPerCreep: this.communeManager.room.memory[RoomMemoryKeys.minHaulerCost],
                    priority,
                    memoryAdditions: {},
                }
            })(),
        )
    }

    private mineralHarvester() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                if (this.communeManager.room.controller.level < 6) return false
                if (!this.communeManager.room.roomManager.structures.extractor.length) return false
                if (!this.communeManager.room.roomManager.mineralContainer) return false
                if (!this.communeManager.room.storage) return false
                if (
                    this.communeManager.room.roomManager.resourcesInStoringStructures.energy < 40000
                )
                    return false
                if (!this.communeManager.room.terminal) return false
                if (this.communeManager.room.terminal.store.getFreeCapacity() <= 10000) return false
                if (this.communeManager.room.roomManager.mineral.mineralAmount === 0) return false

                const minCost = 850
                if (this.spawnEnergyCapacity < minCost) return false

                return {
                    role: 'mineralHarvester',
                    defaultParts: [MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY],
                    extraParts: [MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK],
                    partsMultiplier: 4,
                    minCreeps: this.communeManager.room.roomManager.mineralHarvestPositions.length,
                    minCost,
                    priority: this.activeRemotePriority + 1,
                    memoryAdditions: {
                        [CreepMemoryKeys.preferRoads]: true,
                    },
                }
            })(),
        )
    }

    private hubHauler() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                if (this.communeManager.room.controller.level < 5) return false
                if (!this.communeManager.room.storage) return false

                // There is no hubLink and another link, or no terminal

                if (
                    (!this.communeManager.room.roomManager.hubLink ||
                        this.communeManager.room.roomManager.structures.link.length < 2) &&
                    (!this.communeManager.room.terminal ||
                        !this.communeManager.room.terminal.RCLActionable)
                )
                    return false

                return {
                    role: 'hubHauler',
                    defaultParts: [MOVE],
                    extraParts: [CARRY],
                    partsMultiplier: 8,
                    minCreeps: 1,
                    minCost: 300,
                    priority: 7,
                    memoryAdditions: {},
                }
            })(),
        )
    }

    private fastFiller() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                // Get the fastFiller positions, if there are none, inform false

                const fastFillerPositionsCount =
                    this.communeManager.room.roomManager.fastFillerPositions.length
                if (!fastFillerPositionsCount) return false

                let priority = 0.75

                let totalFastFillerEnergy = 0
                for (const container of this.communeManager.room.roomManager.fastFillerContainers) {

                    totalFastFillerEnergy += container.store.energy
                }

                if (totalFastFillerEnergy < 1000) priority = 1.25

                let defaultParts: BodyPartConstant[]
                if (this.communeManager.room.controller.level >= 8)
                    defaultParts = [CARRY, MOVE, CARRY, CARRY, CARRY, CARRY]
                else if (this.communeManager.room.controller.level >= 7)
                    defaultParts = [CARRY, MOVE, CARRY, CARRY]
                else defaultParts = [CARRY, MOVE, CARRY]

                return {
                    role: 'fastFiller',
                    defaultParts,
                    extraParts: [],
                    partsMultiplier: 1,
                    minCreeps: fastFillerPositionsCount,
                    minCost: 150,
                    priority,
                    memoryAdditions: {},
                }
            })(),
        )
    }

    private defenders() {
        // Construct requests for meleeDefenders

        if (this.communeManager.room.towerInferiority) {
            // Defenders

            const minPriority = 6
            const maxPriority = this.minRemotePriority - 1

            const enemyCreeps = this.communeManager.room.roomManager.notMyCreeps.enemy

            // Melee defender

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    const role = 'meleeDefender'

                    if (this.communeManager.room.myCreeps[role].length * 1.75 > enemyCreeps.length)
                        return false

                    // If towers, spawn based on healStrength. If no towers, use attackStrength and healStrength

                    let requiredStrength = 1
                    if (!this.communeManager.room.controller.safeMode) {
                        requiredStrength +=
                            this.communeManager.room.roomManager.totalEnemyCombatStrength.heal
                        if (!this.communeManager.room.roomManager.structures.tower.length) {
                            requiredStrength +=
                                this.communeManager.room.roomManager.totalEnemyCombatStrength
                                    .melee +
                                this.communeManager.room.roomManager.totalEnemyCombatStrength.ranged
                        }
                    }

                    requiredStrength *= 1.5

                    const priority = Math.min(
                        minPriority + this.communeManager.room.myCreeps[role].length * 0.5,
                        maxPriority,
                    )
                    /*
                    // If all RCL 3 extensions are build

                    if (this.spawnEnergyCapacity >= 800) {
                        const extraParts = [ATTACK, ATTACK, MOVE]
                        const strength = ATTACK_POWER * 2

                        return {
                            role,
                            defaultParts: [],
                            extraParts,
                            partsMultiplier: Math.max(requiredStrength / strength / 2, 1),
                            minCost: 210,
                            priority,
                            threshold: 0.1,
                            memoryAdditions: {},
                        }
                    }
 */
                    const extraParts = [ATTACK, MOVE]
                    const strength = ATTACK_POWER

                    return {
                        role,
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: Math.max(requiredStrength / strength, 1),
                        minCost: 260,
                        priority,
                        threshold: 0.1,
                        memoryAdditions: {},
                    }
                })(),
            )

            // Ranged defender

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    const role = 'rangedDefender'

                    if (this.communeManager.room.myCreeps[role].length * 1.75 > enemyCreeps.length)
                        return false

                    // If towers, spawn based on healStrength. If no towers, use attackStrength and healStrength

                    let requiredStrength = 1
                    if (!this.communeManager.room.controller.safeMode) {
                        requiredStrength +=
                            this.communeManager.room.roomManager.totalEnemyCombatStrength.heal
                        if (!this.communeManager.room.roomManager.structures.tower.length) {
                            requiredStrength +=
                                this.communeManager.room.roomManager.totalEnemyCombatStrength
                                    .melee +
                                this.communeManager.room.roomManager.totalEnemyCombatStrength.ranged
                        }
                    }
                    requiredStrength *= 0.3

                    const priority = Math.min(
                        maxPriority - 1 + this.communeManager.room.myCreeps[role].length * 1,
                        maxPriority,
                    )
                    /*
                    // If all RCL 3 extensions are build

                    if (this.spawnEnergyCapacity >= 800) {
                        const extraParts = [RANGED_ATTACK, RANGED_ATTACK, MOVE]
                        const strength = RANGED_ATTACK_POWER * 2

                        return {
                            role,
                            defaultParts: [],
                            extraParts,
                            partsMultiplier: Math.max(requiredStrength / strength / 2, 1),
                            minCost: 210,
                            priority,
                            threshold: 0.1,
                            memoryAdditions: {},
                        }
                    }
 */
                    const extraParts = [RANGED_ATTACK, MOVE]
                    const strength = RANGED_ATTACK_POWER

                    return {
                        role,
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: Math.max(requiredStrength / strength, 1),
                        minCost: 260,
                        priority,
                        threshold: 0.1,
                        memoryAdditions: {},
                    }
                })(),
            )
        }
    }

    private maintainers() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                const generalRepairStructures =
                    this.communeManager.room.roomManager.generalRepairStructures
                const repairTargets = generalRepairStructures.filter(
                    structure => structure.hitsMax * 0.2 >= structure.hits,
                )

                // Get ramparts below their max hits

                const repairRamparts = this.communeManager.rampartRepairTargets.filter(
                    rampart =>
                        rampart.hits < this.communeManager.room.communeManager.minRampartHits,
                )

                // If there are no ramparts or repair targets

                if (!repairRamparts.length && !repairTargets.length) return false

                let priority: number

                if (
                    repairTargets.length ||
                    this.communeManager.room.towerInferiority ||
                    !this.communeManager.storingStructures.length
                ) {
                    priority = Math.min(
                        6 + this.communeManager.room.creepsFromRoom.maintainer.length * 0.5,
                        this.minRemotePriority - 0.5,
                    )
                } else {
                    priority = this.activeRemotePriority
                }

                // Construct the partsMultiplier

                let partsMultiplier = 1

                for (const structure of repairTargets) {
                    partsMultiplier += decayCosts[structure.structureType]
                }

                partsMultiplier *= 2

                // Extra considerations if a storage is present

                let maxCreeps = Infinity
                const enemyAttackers = this.communeManager.room.roomManager.enemyAttackers

                if (
                    this.communeManager.room.storage &&
                    this.communeManager.room.controller.level >= 4
                ) {
                    if (repairRamparts.length <= 0 && !enemyAttackers.length) {
                        maxCreeps = 1
                    }

                    // For every x energy in storage, add 1 multiplier

                    partsMultiplier += Math.pow(
                        this.communeManager.room.roomManager.resourcesInStoringStructures.energy /
                            (16000 + this.communeManager.room.controller.level * 1000),
                        1.8,
                    )
                }

                // For every attackValue, add a multiplier

                if (enemyAttackers.length) {
                    const totalEnemyCombatStrength =
                        this.communeManager.room.roomManager.totalEnemyCombatStrength

                    partsMultiplier +=
                        (totalEnemyCombatStrength.melee +
                            totalEnemyCombatStrength.ranged * 1.6 +
                            totalEnemyCombatStrength.dismantle) /
                        (REPAIR_POWER * 0.3)
                }

                customLog('e', partsMultiplier)
                const role = 'maintainer'

                // If all RCL 3 extensions are build

                if (this.communeManager.hasSufficientRoads) {
                    return {
                        role,
                        defaultParts: [],
                        extraParts: [CARRY, MOVE, WORK],
                        partsMultiplier,

                        maxCreeps,
                        minCost: 200,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                return {
                    role,
                    defaultParts: [],
                    extraParts: [MOVE, CARRY, MOVE, WORK],
                    partsMultiplier,

                    maxCreeps,
                    minCost: 250,
                    priority,
                    memoryAdditions: {},
                }
            })(),
        )
    }

    private builders() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                if (this.communeManager.room.towerInferiority) return false

                // Stop if there are no construction sites

                if (!this.communeManager.room.find(FIND_MY_CONSTRUCTION_SITES).length) return false

                let priority: number
                if (this.communeManager.storingStructures.length) {
                    priority = this.activeRemotePriority + 0.1
                } else {
                    priority = this.minRemotePriority - 0.5
                }

                let partsMultiplier = 0

                const actionableStoringStructure =
                    (this.communeManager.room.storage &&
                        this.communeManager.room.controller.level >= 4) ||
                    (this.communeManager.room.terminal &&
                        this.communeManager.room.controller.level >= 6)

                // If there is an rcl actionable storage or terminal
                if (actionableStoringStructure) {
                    // If the storage is sufficiently full, increase parts wanted porportionately

                    if (
                        this.communeManager.room.roomManager.resourcesInStoringStructures.energy <
                        this.communeManager.room.communeManager.storedEnergyBuildThreshold
                    )
                        return false

                    partsMultiplier += Math.pow(
                        this.communeManager.room.roomManager.resourcesInStoringStructures.energy /
                            (20000 + this.communeManager.room.controller.level * 1200),
                        1.7,
                    )
                }

                // Otherwise if there is no storage
                else {
                    partsMultiplier += this.communeManager.estimatedEnergyIncome / 5

                    // Spawn some extra builders to handle the primarily road building RCL 3 and needy storage building

                    if (this.spawnEnergyCapacity >= 800) partsMultiplier *= 1.2
                }

                const role = 'builder'
                const maxCreeps = 15

                // If there is an rcl actionable storage or terminal
                if (actionableStoringStructure) {
                    return {
                        role,
                        defaultParts: [],
                        extraParts: [CARRY, WORK, MOVE],
                        partsMultiplier: partsMultiplier,
                        maxCreeps,
                        minCost: 200,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                // If all RCL 3 extensions are build

                if (this.spawnEnergyCapacity >= 600) {
                    return {
                        role,
                        defaultParts: [],
                        extraParts: [CARRY, WORK, MOVE],
                        partsMultiplier: partsMultiplier,
                        maxCreeps,
                        minCost: 200,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                // If almost all RCL 3 extensions are build

                if (this.spawnEnergyCapacity >= 550) {
                    return {
                        role,
                        defaultParts: [],
                        extraParts: [WORK, MOVE, CARRY, MOVE],
                        partsMultiplier: partsMultiplier,
                        maxCreeps,
                        minCost: 250,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                // There are no fastFiller containers

                if (
                    !this.communeManager.room.roomManager.fastFillerContainers.length
                ) {
                    return {
                        role,
                        defaultParts: [],
                        extraParts: [WORK, CARRY, CARRY, MOVE],
                        partsMultiplier: partsMultiplier,
                        maxCreeps,
                        minCost: 250,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                return {
                    role,
                    defaultParts: [],
                    extraParts: [CARRY, MOVE, WORK, CARRY, MOVE],
                    partsMultiplier: partsMultiplier,
                    maxCreeps,
                    minCost: 300,
                    priority,
                    memoryAdditions: {
                        [CreepMemoryKeys.preferRoads]: true,
                    },
                }
            })(),
        )
    }

    private controllerUpgraders() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                const threshold = 0.05
                const role = 'controllerUpgrader'

                // If there is a storage, prefer needed remote creeps over upgraders

                if (
                    this.communeManager.room.controller.level === 1 ||
                    this.communeManager.room.controller.ticksToDowngrade <=
                        this.communeManager.controllerDowngradeUpgradeThreshold
                ) {
                    const priority = 5

                    if (this.communeManager.hasSufficientRoads) {
                        return {
                            role,
                            defaultParts: [CARRY, WORK, MOVE],
                            extraParts: [],
                            partsMultiplier: 1,
                            threshold,
                            minCreeps: 1,
                            minCost: 200,
                            priority,
                            memoryAdditions: {},
                        }
                    }

                    return {
                        role,
                        defaultParts: [CARRY, MOVE, WORK, MOVE],
                        extraParts: [],
                        partsMultiplier: 1,
                        threshold,
                        minCreeps: 1,
                        minCost: 250,
                        priority,
                        memoryAdditions: {},
                    }
                }

                let priority: number
                if (this.communeManager.storingStructures.length) {
                    priority = this.activeRemotePriority + 0.2
                } else {
                    priority = this.minRemotePriority - 1
                }

                // If there are enemyAttackers or construction sites and the controller isn't soon to downgrade

                if (
                    this.communeManager.room.towerInferiority ||
                    this.communeManager.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0
                )
                    return false

                let partsMultiplier = 1

                // Storing structures logic

                if (
                    (this.communeManager.room.storage &&
                        this.communeManager.room.controller.level >= 4) ||
                    (this.communeManager.room.terminal &&
                        this.communeManager.room.controller.level >= 6)
                ) {
                    // If storing structures are sufficiently full, provide x amount per y energy in storage

                    if (
                        this.communeManager.room.roomManager.resourcesInStoringStructures.energy <
                        this.communeManager.room.communeManager.storedEnergyUpgradeThreshold
                    ) {
                        return false
                    }
                    partsMultiplier = Math.pow(
                        (this.communeManager.room.roomManager.resourcesInStoringStructures.energy -
                            this.communeManager.room.communeManager.storedEnergyUpgradeThreshold *
                                0.5) /
                            (6000 + this.communeManager.room.controller.level * 2000),
                        2,
                    )
                }

                // Otherwise if there is no storing structure
                else {
                    partsMultiplier += this.communeManager.estimatedEnergyIncome * 0.75
                }

                partsMultiplier = Math.min(partsMultiplier, this.communeManager.maxUpgradeStrength)
                if (partsMultiplier <= 0) return false

                // If the controllerContainer or controllerLink exists

                const upgradeStructure = this.communeManager.upgradeStructure

                if (upgradeStructure) {
                    // If the controller is level 8

                    if (this.communeManager.room.controller.level === 8) {
                        return {
                            role,
                            defaultParts: [],
                            extraParts: [
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                CARRY,
                                CARRY,
                                CARRY,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                                MOVE,
                            ],
                            partsMultiplier: 1,
                            threshold,
                            minCreeps: 1,
                            minCost: 300,
                            priority,
                            memoryAdditions: {
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    const controllerLink = this.communeManager.controllerLink
                    const maxCreeps =
                        controllerLink && controllerLink.RCLActionable
                            ? this.communeManager.room.roomManager.upgradePositions.length
                            : this.communeManager.room.roomManager.upgradePositions.length - 1

                    if (this.spawnEnergyCapacity >= 1400) {
                        partsMultiplier = Math.round(partsMultiplier / 12)
                        if (partsMultiplier === 0) return false

                        return {
                            role,
                            defaultParts: [],
                            extraParts: [
                                MOVE,
                                CARRY,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                MOVE,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                                MOVE,
                                WORK,
                                WORK,
                                WORK,
                                WORK,
                            ],
                            partsMultiplier,
                            threshold,
                            maxCreeps,
                            minCost: 200,
                            priority,
                            memoryAdditions: {
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    if (this.spawnEnergyCapacity >= 1000) {
                        partsMultiplier = Math.round(partsMultiplier / 4)
                        if (partsMultiplier === 0) return false

                        return {
                            role,
                            defaultParts: [CARRY, CARRY],
                            extraParts: [WORK, MOVE, WORK, WORK, WORK],
                            partsMultiplier,
                            threshold,

                            maxCreeps,
                            minCost: 250,
                            priority,
                            memoryAdditions: {
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    // Otherwise if the this.spawnEnergyCapacity is more than 800

                    if (this.spawnEnergyCapacity >= 800) {
                        partsMultiplier = Math.round(partsMultiplier / 6)
                        if (partsMultiplier === 0) return false

                        return {
                            role,
                            defaultParts: [CARRY, CARRY],
                            extraParts: [WORK, MOVE, WORK, WORK, WORK, WORK, MOVE, WORK],
                            partsMultiplier,
                            threshold,

                            maxCreeps,
                            minCost: 250,
                            priority,
                            memoryAdditions: {
                                [CreepMemoryKeys.preferRoads]: true,
                            },
                        }
                    }

                    partsMultiplier = Math.round(partsMultiplier / 4)
                    if (partsMultiplier === 0) return false

                    return {
                        role,
                        defaultParts: [CARRY],
                        extraParts: [WORK, MOVE, WORK, WORK, WORK],
                        partsMultiplier,
                        threshold,

                        maxCreeps,
                        minCost: 200,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                if (this.communeManager.room.controller.level < 2)
                    partsMultiplier = Math.max(partsMultiplier, 1)

                if (this.spawnEnergyCapacity >= 800) {
                    return {
                        role,
                        defaultParts: [],
                        extraParts: [CARRY, MOVE, WORK],
                        partsMultiplier,
                        threshold,
                        maxCreeps: Infinity,
                        minCost: 200,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                        },
                    }
                }

                return {
                    role,
                    defaultParts: [],
                    extraParts: [MOVE, CARRY, MOVE, WORK],
                    partsMultiplier,
                    threshold,
                    maxCreeps: Infinity,
                    minCost: 250,
                    priority,
                    memoryAdditions: {},
                }
            })(),
        )
    }

    /**
     * Spawn for roles that are per-source
     */
    private remoteSourceRoles() {
        let priorityIncrement = 0

        const remoteSourceIndexesByEfficacy =
            this.communeManager.room.roomManager.remoteSourceIndexesByEfficacy
        for (const remoteInfo of remoteSourceIndexesByEfficacy) {
            const splitRemoteInfo = remoteInfo.split(' ')
            const remoteName = splitRemoteInfo[0]

            const remoteMemory = Memory.rooms[remoteName]
            if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.remote) continue
            if (remoteMemory[RoomMemoryKeys.commune] !== this.communeManager.room.name) continue
            if (remoteMemory[RoomMemoryKeys.enemyReserved]) continue
            if (remoteMemory[RoomMemoryKeys.abandonRemote]) continue

            priorityIncrement += 1

            const sourceIndex = parseInt(splitRemoteInfo[1]) as 0 | 1

            /*
            const remoteHaulerNeed = remoteMemory[RoomMemoryKeys.remoteHaulers][sourceIndex]
            const harvesterPriority = this.minRemotePriority + priorityIncrement + (remoteHaulerNeed > 0 ? 1 : 100)
 */

            const harvesterPriority = this.minRemotePriority + priorityIncrement

            // Construct requests for remoteSourceHarvesters

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    const partsMultiplier =
                        remoteMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex] -
                        remoteMemory[RoomMemoryKeys.remoteSourceHarvesters][sourceIndex]
                    if (partsMultiplier <= 0) return false

                    const role = 'remoteSourceHarvester'
                    const priority = harvesterPriority
                    const spawnGroup =
                        this.communeManager.remoteSourceHarvesters[remoteName][sourceIndex]
                    const sourcePositionsAmount =
                        remoteMemory[RoomMemoryKeys.remoteSourceHarvestPositions][sourceIndex]
                            .length / packedPosLength

                    if (this.spawnEnergyCapacity >= 950) {
                        return {
                            role,
                            defaultParts: [CARRY],
                            extraParts: [WORK, MOVE, WORK, MOVE],
                            partsMultiplier: Math.ceil(partsMultiplier / 2),
                            spawnGroup,
                            threshold: 0.1,
                            minCreeps: 1,
                            maxCreeps: sourcePositionsAmount,
                            maxCostPerCreep: 50 + 150 * 6,
                            minCost: 350,
                            priority,
                            memoryAdditions: {
                                [CreepMemoryKeys.preferRoads]: true,
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.remote]: remoteName,
                            },
                        }
                    }

                    // We can start reserving

                    if (this.spawnEnergyCapacity >= 650) {
                        return {
                            role,
                            defaultParts: [CARRY],
                            extraParts: [WORK, WORK, MOVE],
                            partsMultiplier: Math.ceil(partsMultiplier / 2),
                            spawnGroup,
                            threshold: 0.1,

                            maxCreeps: sourcePositionsAmount,
                            maxCostPerCreep: 50 + 250 * 3,
                            minCost: 300,
                            priority,
                            memoryAdditions: {
                                [CreepMemoryKeys.preferRoads]: true,
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.remote]: remoteName,
                            },
                        }
                    }

                    if (this.spawnEnergyCapacity >= 450) {
                        return {
                            role,
                            defaultParts: [CARRY],
                            extraParts: [WORK, WORK, MOVE, WORK, MOVE],
                            partsMultiplier: Math.floor(partsMultiplier / 2),
                            spawnGroup,
                            threshold: 0.1,

                            maxCreeps: sourcePositionsAmount,
                            maxCostPerCreep: 50 + 400 * 2,
                            minCost: 300,
                            priority,
                            memoryAdditions: {
                                [CreepMemoryKeys.preferRoads]: true,
                                [CreepMemoryKeys.sourceIndex]: sourceIndex,
                                [CreepMemoryKeys.remote]: remoteName,
                            },
                        }
                    }

                    return {
                        role,
                        defaultParts: [CARRY],
                        extraParts: [WORK, WORK, MOVE],
                        partsMultiplier: Math.ceil(partsMultiplier / 2),
                        spawnGroup,
                        threshold: 0.1,

                        maxCreeps: sourcePositionsAmount,
                        maxCostPerCreep: 50 + 250 * 3,
                        minCost: 300,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.preferRoads]: true,
                            [CreepMemoryKeys.sourceIndex]: sourceIndex,
                            [CreepMemoryKeys.remote]: remoteName,
                        },
                    }
                })(),
            )

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    const role = 'remoteHauler'

                    const partsMultiplier =
                        remoteMemory[RoomMemoryKeys.remoteHaulers][sourceIndex] -
                        this.communeManager.haulerCarryParts
                    this.communeManager.haulerCarryParts -=
                        remoteMemory[RoomMemoryKeys.remoteHaulers][sourceIndex]
                    if (partsMultiplier <= 0) return false

                    this.activeRemotePriority = Math.max(
                        this.activeRemotePriority,
                        harvesterPriority + 0.1,
                    )

                    // Lower priority - more preference - than remote harvesters

                    const priority = this.minRemotePriority + priorityIncrement

                    /*
                    // If all RCL 3 extensions are built
                    if (this.spawnEnergyCapacity >= 800) {

                        const cost = Math.floor(this.communeManager.room.memory[RoomMemoryKeys.minHaulerCost] / 150) * 150

                            return {
                                defaultParts: [],
                                extraParts: [CARRY, CARRY, MOVE],
                                threshold: 0,
                                partsMultiplier: partsMultiplier / 2,
                                minCost: cost,
                                maxCostPerCreep: cost,
                                priority,
                                memoryAdditions: {
                                    [CreepMemoryKeys.preferRoads]: true,
                                },
                            }
                    }
                    */

                    const cost =
                        Math.floor(
                            this.communeManager.room.memory[RoomMemoryKeys.minHaulerCost] / 100,
                        ) * 100

                    return {
                        role,
                        defaultParts: [],
                        extraParts: [CARRY, MOVE],
                        spawnGroup: [],
                        threshold: 0,
                        partsMultiplier,
                        minCost: cost,
                        maxCostPerCreep: cost,
                        priority,
                        memoryAdditions: {},
                    }
                })(),
            )
        }
    }

    private generalRemoteRoles() {
        const remoteNamesByEfficacy = this.communeManager.room.roomManager.remoteNamesByEfficacy

        for (let index = 0; index < remoteNamesByEfficacy.length; index += 1) {
            const remoteName = remoteNamesByEfficacy[index]
            const remoteMemory = Memory.rooms[remoteName]
            if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.remote) continue
            if (remoteMemory[RoomMemoryKeys.commune] !== this.communeManager.room.name) continue

            // Add up econ data for this.communeManager.room this.communeManager.room

            const totalRemoteNeed =
                Math.max(remoteMemory[RoomMemoryKeys.remoteBuilder], 0) +
                Math.max(remoteMemory[RoomMemoryKeys.remoteReserver], 0) +
                Math.max(remoteMemory[RoomMemoryKeys.remoteCoreAttacker], 0) +
                Math.max(remoteMemory[RoomMemoryKeys.remoteDismantler], 0)

            // If there is a need for any econ creep, inform the index

            if (totalRemoteNeed <= 0) continue

            // Construct requests for remoteBuilders

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    return false

                    // If there are no data for this.communeManager.room this.communeManager.room, inform false

                    if (remoteMemory[RoomMemoryKeys.remoteBuilder] <= 0) return false

                    // If there are insufficient harvesters for the remote's sources

                    if (
                        remoteMemory[RoomMemoryKeys.remoteSourceHarvesters].reduce(
                            (partialSum, val) => partialSum + val,
                            0,
                        ) === 0
                    )
                        return false

                    return {
                        role: 'remoteBuilder',
                        defaultParts: [],
                        extraParts: [WORK, MOVE, CARRY, MOVE],
                        partsMultiplier: remoteMemory[RoomMemoryKeys.remoteBuilder],
                        spawnGroup:
                            this.communeManager.room.creepsOfRemote[remoteName].remoteBuilder,
                        maxCreeps:
                            remoteMemory[RoomMemoryKeys.remoteControllerPositions].length /
                            packedPosLength,
                        minCost: 250,
                        priority: this.minRemotePriority + 0.1,
                        memoryAdditions: {
                            [CreepMemoryKeys.remote]: remoteName,
                        },
                    }
                })(),
            )

            // Construct requests for remoteReservers

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    // If there are no data for this.communeManager.room this.communeManager.room, inform false

                    if (remoteMemory[RoomMemoryKeys.remoteReserver] <= 0) return false

                    let cost = 650

                    // If there isn't enough this.spawnEnergyCapacity to spawn a remoteReserver, inform false

                    if (this.spawnEnergyCapacity < cost) return false

                    // If there are insufficient harvesters for the remote's sources

                    if (
                        remoteMemory[RoomMemoryKeys.remoteSourceHarvesters].reduce(
                            (partialSum, val) => partialSum + val,
                            0,
                        ) === 0
                    )
                        return false

                    const priority = this.minRemotePriority + 0.1
                    this.activeRemotePriority = Math.max(this.activeRemotePriority, priority + 0.1)

                    return {
                        role: 'remoteReserver',
                        defaultParts: [],
                        extraParts: [MOVE, CLAIM],
                        partsMultiplier: remoteMemory[RoomMemoryKeys.remoteReserver],
                        spawnGroup:
                            this.communeManager.room.creepsOfRemote[remoteName].remoteReserver,
                        maxCreeps:
                            remoteMemory[RoomMemoryKeys.remoteControllerPositions].length /
                            packedPosLength,
                        minCost: cost,
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.remote]: remoteName,
                        },
                    }
                })(),
            )

            // Construct requests for remoteDefenders
            /*
            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    // If there are no related data

                    if (remoteData[RemoteData.minDamage] + remoteData[RemoteData.minHeal] <= 0) return false
                    if (this.communeManager.room.towerInferiority) return false

                    let minRangedAttackCost = 0

                    if (remoteData[RemoteData.minDamage] > 0) {
                        minRangedAttackCost =
                            (remoteData[RemoteData.minDamage] / RANGED_ATTACK_POWER) * BODYPART_COST[RANGED_ATTACK] +
                            (remoteData[RemoteData.minDamage] / RANGED_ATTACK_POWER) * BODYPART_COST[MOVE]
                    }

                    const rangedAttackAmount = Math.max(
                        Math.floor(minRangedAttackCost / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])),
                        1,
                    )

                    let minHealCost = 0

                    if (remoteData[RemoteData.minHeal] > 0) {
                        minHealCost =
                            (remoteData[RemoteData.minHeal] / HEAL_POWER) * BODYPART_COST[HEAL] +
                            (remoteData[RemoteData.minHeal] / HEAL_POWER) * BODYPART_COST[MOVE]
                    }

                    const healAmount = Math.floor(minHealCost / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]))

                    if ((rangedAttackAmount + healAmount) * 2 > 50) {
                        Memory.rooms[remoteName][RoomMemoryKeys.abandonRemote] = randomRange(1000, 1500)
                        return false
                    }

                    const minCost = minRangedAttackCost + minHealCost
                    if (minCost > this.spawnEnergyCapacity) {
                        Memory.rooms[remoteName][RoomMemoryKeys.abandonRemote] = randomRange(1000, 1500)
                        return false
                    }

                    const extraParts: BodyPartConstant[] = []

                    for (let i = 0; i < rangedAttackAmount; i++) {
                        extraParts.push(RANGED_ATTACK, MOVE)
                    }

                    for (let i = 0; i < healAmount; i++) {
                        extraParts.push(HEAL, MOVE)
                    }

                    return {
                        role: 'remoteDefender',
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: 1,
                        spawnGroup: this.communeManager.room.creepsOfRemote[remoteName].remoteDefender,
                        minCreeps: 1,
                        minCost,
                        priority: this.minRemotePriority - 3,
                        memoryAdditions: {},
                    }
                })(),
            ) */

            // Construct requests for remoteCoreAttackers

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    // If there are no related data

                    if (remoteMemory[RoomMemoryKeys.remoteCoreAttacker] <= 0) return false

                    // Define the minCost and strength

                    const cost = 130
                    const extraParts = [ATTACK, MOVE]

                    return {
                        role: 'remoteCoreAttacker',
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: 50 / extraParts.length,
                        spawnGroup:
                            this.communeManager.room.creepsOfRemote[remoteName].remoteCoreAttacker,
                        /* minCreeps: 1, */
                        maxCreeps: 3,
                        minCost: cost * extraParts.length,
                        priority: this.minRemotePriority - 2,
                        memoryAdditions: {
                            [CreepMemoryKeys.remote]: remoteName,
                        },
                    }
                })(),
            )

            // Construct requests for remoteDismantler

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    // If there are no related data

                    if (remoteMemory[RoomMemoryKeys.remoteDismantler] <= 0) return false

                    // Define the minCost and strength

                    const cost = 150
                    const extraParts = [WORK, MOVE]

                    return {
                        role: 'remoteDismantler',
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: 50 / extraParts.length,
                        spawnGroup:
                            this.communeManager.room.creepsOfRemote[remoteName].remoteDismantler,
                        minCreeps: 1,
                        minCost: cost * 2,
                        priority: this.minRemotePriority - 1,
                        memoryAdditions: {
                            [CreepMemoryKeys.remote]: remoteName,
                        },
                    }
                })(),
            )
        }
    }

    private scout() {
        this.rawSpawnRequestsArgs.push(
            ((): SpawnRequestArgs | false => {
                let minCreeps: number
                if (this.communeManager.room.roomManager.structures.observer.length) minCreeps = 1
                else minCreeps = 2

                return {
                    role: 'scout',
                    defaultParts: [],
                    extraParts: [MOVE],
                    partsMultiplier: 1,
                    minCreeps,
                    minCost: 50,
                    priority: this.activeRemotePriority + 0.3,
                    memoryAdditions: {},
                }
            })(),
        )
    }

    private workRequestRoles() {
        if (this.communeManager.room.memory[RoomMemoryKeys.workRequest]) {
            const requestName = this.communeManager.room.memory[RoomMemoryKeys.workRequest]
            const request = Memory.workRequests[requestName]

            // Construct requests for claimers

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    if (request[WorkRequestKeys.claimer] <= 0) return false

                    return {
                        role: 'claimer',
                        defaultParts: [CLAIM, MOVE],
                        extraParts: [MOVE, MOVE, MOVE, MOVE],
                        partsMultiplier: 1,
                        minCreeps: 1,
                        minCost: 650,
                        priority: 8.1,
                        memoryAdditions: {
                            [CreepMemoryKeys.taskRoom]: requestName,
                        },
                    }
                })(),
            )

            // Requests for vanguard

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    if (request[WorkRequestKeys.vanguard] <= 0) return false

                    let maxCreeps = 0
                    for (const packedPositions of Memory.rooms[requestName][
                        RoomMemoryKeys.communeSourceHarvestPositions
                    ]) {
                        maxCreeps += packedPositions.length
                    }

                    return {
                        role: 'vanguard',
                        defaultParts: [],
                        extraParts: [WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
                        partsMultiplier: request[WorkRequestKeys.vanguard],
                        maxCreeps,
                        minCost: 250,
                        priority: 8.2,
                        memoryAdditions: {
                            [CreepMemoryKeys.taskRoom]: requestName,
                        },
                    }
                })(),
            )

            // allyVanguard

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    // If there is no vanguard need

                    if (request[WorkRequestKeys.allyVanguard] <= 0) return false

                    return {
                        role: 'allyVanguard',
                        defaultParts: [],
                        extraParts: [WORK, CARRY, CARRY, MOVE, MOVE, MOVE],
                        partsMultiplier: request[WorkRequestKeys.allyVanguard],
                        minCost: 250,
                        priority: 10 + this.communeManager.room.creepsFromRoom.allyVanguard.length,
                        memoryAdditions: {
                            [CreepMemoryKeys.taskRoom]: requestName,
                        },
                    }
                })(),
            )
        }
    }

    private requestHauler() {
        for (const requestName of this.communeManager.room.memory[RoomMemoryKeys.haulRequests]) {
            const request = Memory.haulRequests[requestName]
            if (!request) continue

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    const priority = Math.min(
                        0.5 + this.communeManager.room.creepsFromRoom.requestHauler.length / 2,
                        this.minRemotePriority - 1,
                    )

                    return {
                        role: 'requestHauler',
                        defaultParts: [],
                        extraParts: [CARRY, MOVE],
                        partsMultiplier: 100,
                        minCost: 100,
                        maxCostPerCreep:
                            this.communeManager.room.memory[RoomMemoryKeys.minHaulerCost],
                        priority,
                        memoryAdditions: {
                            [CreepMemoryKeys.haulRequest]: requestName,
                        },
                    }
                })(),
            )
        }
    }

    private antifa() {
        let priority = this.minRemotePriority

        for (
            let i = this.communeManager.room.memory[RoomMemoryKeys.combatRequests].length - 1;
            i >= 0;
            i -= 1
        ) {
            const requestName =
                Memory.rooms[this.communeManager.room.name][RoomMemoryKeys.combatRequests][i]
            const request = Memory.combatRequests[requestName]

            if (!request) continue

            if (request[CombatRequestKeys.abandon] > 0) continue

            priority -= 0.01

            //

            const minRangedAttackCost =
                this.communeManager.room.communeManager.findMinRangedAttackCost(
                    request[CombatRequestKeys.minDamage],
                )
            const rangedAttackAmount = Math.floor(
                minRangedAttackCost / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]),
            )

            const minAttackCost = this.communeManager.room.communeManager.findMinMeleeAttackCost(
                request[CombatRequestKeys.minDamage],
            )
            const attackAmount = Math.floor(
                minAttackCost / (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE]),
            )

            const minMeleeHealCost = this.communeManager.room.communeManager.findMinHealCost(
                request[CombatRequestKeys.minMeleeHeal] +
                    (request[CombatRequestKeys.maxTowerDamage] || 0),
            )
            const meleeHealAmount = Math.floor(
                minMeleeHealCost / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]),
            )

            const minRangedHealCost = this.communeManager.room.communeManager.findMinHealCost(
                request[CombatRequestKeys.minRangedHeal] +
                    (request[CombatRequestKeys.maxTowerDamage] || 0),
            )
            const rangedHealAmount = Math.floor(
                minRangedHealCost / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]),
            )

            const minDismantleCost =
                request[CombatRequestKeys.dismantle] * BODYPART_COST[WORK] +
                    request[CombatRequestKeys.dismantle] * BODYPART_COST[MOVE] || 0

            if (
                request[CombatRequestKeys.type] === 'attack' ||
                request[CombatRequestKeys.type] === 'defend'
            ) {
                if (
                    minRangedAttackCost + minRangedHealCost >
                        this.communeManager.room.energyCapacityAvailable ||
                    minAttackCost > this.communeManager.room.energyCapacityAvailable ||
                    (rangedAttackAmount + rangedHealAmount) * 2 > 50 ||
                    attackAmount * 2 > 50
                ) {
                    this.communeManager.room.communeManager.deleteCombatRequest(requestName, i)
                    continue
                }

                // Spawn quad

                this.rawSpawnRequestsArgs.push(
                    ((): SpawnRequestArgs | false => {
                        // We currently have enough quads

                        if (
                            request[CombatRequestKeys.quads] >= request[CombatRequestKeys.quadQuota]
                        )
                            return false

                        const role = 'antifaRangedAttacker'

                        let spawnGroup: string[]

                        if (collectiveManager.creepsByCombatRequest[requestName]) {
                            spawnGroup = collectiveManager.creepsByCombatRequest[requestName][role]
                        }
                        spawnGroup = []

                        const minCost = minRangedAttackCost + minRangedHealCost
                        const extraParts: BodyPartConstant[] = []

                        interface TradeType {
                            amount: number
                            other: BodyPartConstant
                        }

                        const tradeTypes: { [key in BodyPartConstant]?: TradeType } = {
                            [RANGED_ATTACK]: {
                                amount: rangedAttackAmount,
                                other: HEAL,
                            },
                            [HEAL]: {
                                amount: rangedHealAmount,
                                other: RANGED_ATTACK,
                            },
                        }
                        const totalTradeableParts = rangedAttackAmount + rangedHealAmount

                        let tradeAmount = Infinity

                        for (const key in tradeTypes) {
                            const partType = key as BodyPartConstant
                            const tradeType = tradeTypes[partType]
                            const ratio = tradeType.amount / totalTradeableParts

                            let localTradeAmount = Math.ceil(tradeType.amount * ratio * 0.75)
                            if (localTradeAmount >= tradeAmount) continue

                            function findCost() {
                                return (
                                    (tradeType.amount + localTradeAmount) *
                                        BODYPART_COST[partType] +
                                    (tradeTypes[tradeType.other].amount - localTradeAmount) *
                                        BODYPART_COST[tradeType.other] +
                                    totalTradeableParts * BODYPART_COST[MOVE]
                                )
                            }

                            while (findCost() > this.spawnEnergyCapacity) {
                                localTradeAmount -= 1
                            }

                            tradeAmount = localTradeAmount
                        }

                        // We need attack and tough oriented creeps

                        if (
                            this.communeManager.room.squadRequests.size <
                            (request[CombatRequestKeys.quads] + 1) * 4 - 2
                        ) {
                            for (let i = 0; i < rangedAttackAmount + tradeAmount; i++) {
                                extraParts.push(RANGED_ATTACK, MOVE)
                            }

                            for (let i = 0; i < rangedHealAmount - tradeAmount; i++) {
                                extraParts.push(HEAL, MOVE)
                            }
                        }

                        // We need heal-oriented creeps
                        else {
                            for (let i = 0; i < rangedAttackAmount - tradeAmount; i++) {
                                extraParts.push(RANGED_ATTACK, MOVE)
                            }

                            for (let i = 0; i < rangedHealAmount + tradeAmount; i++) {
                                extraParts.push(HEAL, MOVE)
                            }
                        }

                        if (!extraParts.length) return false

                        return {
                            role,
                            defaultParts: [],
                            extraParts,
                            partsMultiplier: 1,
                            minCost,
                            priority,
                            spawnGroup,
                            minCreeps: request[CombatRequestKeys.quadQuota] * 4,
                            memoryAdditions: {
                                [CreepMemoryKeys.combatRequest]: requestName,
                                [CreepMemoryKeys.squadSize]: 4,
                                [CreepMemoryKeys.squadType]: 'quad',
                                [CreepMemoryKeys.squadCombatType]: 'rangedAttack',
                                [CreepMemoryKeys.squadMoveType]: 'attack',
                            },
                        }
                    })(),
                )
                continue
            }

            // Harass

            if (
                minRangedAttackCost + minRangedHealCost >
                    this.communeManager.room.energyCapacityAvailable ||
                minAttackCost + minMeleeHealCost >
                    this.communeManager.room.energyCapacityAvailable ||
                minAttackCost > this.communeManager.room.energyCapacityAvailable
            ) {
                this.communeManager.room.communeManager.deleteCombatRequest(requestName, i)
                continue
            }

            // If the request isn't an attack
            // Spawn RangedAttack Heal singletons
            /*
            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    role = 'antifaRangedAttacker'
                    spawnGroup = collectiveManager.creepsByCombatRequest[requestName][role]
                    const minCost = minRangedAttackCost + minRangedHealCost
                    const extraParts: BodyPartConstant[] = []

                    for (let i = 0; i < rangedAttackAmount; i++) {
                        extraParts.push(RANGED_ATTACK, MOVE)
                    }

                    for (let i = 0; i < rangedHealAmount; i++) {
                        extraParts.push(HEAL, MOVE)
                    }

                    if (!extraParts.length) return false

                    return {
                        role,
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: 1,
                        minCost,
                        priority,
                        spawnGroup,
                        memoryAdditions: {
                            ST: 'dynamic',
                            CRN: requestName,
                        },
                    }
                })(),
            )

            // Spawn dismantlers

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    role = 'antifaDismantler'
                    spawnGroup = collectiveManager.creepsByCombatRequest[requestName][role]
                    const minCost = minDismantleCost
                    let extraParts: BodyPartConstant[] = []

                    const workAmount = request[CombatRequestKeys.dismantle]

                    for (let i = 0; i < workAmount; i++) {
                        extraParts.push(WORK, MOVE)
                    }

                    if (!extraParts.length) return false

                    return {
                        role,
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: 1,
                        minCost,
                        priority,
                        spawnGroup,
                        memoryAdditions: {
                            ST: 'dynamic',
                            CRN: requestName,
                        },
                    }
                })(),
            )

            // Spawn Attack Heal duo

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    role = 'antifaAttacker'
                    spawnGroup = collectiveManager.creepsByCombatRequest[requestName][role]
                    const minCost = minAttackCost
                    let extraParts: BodyPartConstant[] = []

                    for (let i = 0; i < attackAmount; i++) {
                        extraParts.push(ATTACK, MOVE)
                    }

                    if (!extraParts.length) return false

                    return {
                        role,
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: 1,
                        minCost,
                        priority,
                        spawnGroup,
                        memoryAdditions: {
                            SS: 2,
                            ST: 'dynamic',
                            CRN: requestName,
                        },
                    }
                })(),
            )

            this.rawSpawnRequestsArgs.push(
                ((): SpawnRequestArgs | false => {
                    role = 'antifaHealer'
                    spawnGroup = collectiveManager.creepsByCombatRequest[requestName][role]
                    const minCost = minMeleeHealCost
                    let extraParts: BodyPartConstant[] = []

                    for (let i = 0; i < meleeHealAmount; i++) {
                        extraParts.push(HEAL, MOVE)
                    }

                    if (!extraParts.length) return false

                    return {
                        role,
                        defaultParts: [],
                        extraParts,
                        partsMultiplier: 1,
                        minCost,
                        priority,
                        spawnGroup,
                        memoryAdditions: {
                            SS: 2,
                            ST: 'dynamic',
                            CRN: requestName,
                        },
                    }
                })(),
            ) */
        }
    }
}
