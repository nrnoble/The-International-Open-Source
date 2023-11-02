import {
    CreepMemoryKeys,
    packedPosLength,
    ReservedCoordTypes,
    Result,
    RoomLogisticsRequestTypes,
    RoomMemoryKeys,
    RoomTypes,
    WorkTypes,
} from 'international/constants'
import {
    findCarryPartsRequired,
    findObjectWithID,
    getRangeXY,
    getRange,
    randomTick,
    scalePriority,
    areCoordsEqual,
} from 'utils/utils'
import { packCoord, reversePosList, unpackPosAt } from 'other/codec'
import { RemoteHauler } from './remoteHauler'
import { indexOf } from 'lodash'

export class RemoteHarvester extends Creep {
    constructor(creepID: Id<Creep>) {
        super(creepID)
    }

    public isDying(): boolean {
        // Stop if creep is spawning

        if (this.spawning) return false

        if (this.memory[CreepMemoryKeys.remote]) {
            if (
                this.ticksToLive >
                this.body.length * CREEP_SPAWN_TIME +
                    Memory.rooms[this.memory[CreepMemoryKeys.remote]][
                        RoomMemoryKeys.remoteSourceFastFillerPaths
                    ][this.memory[CreepMemoryKeys.sourceIndex]].length /
                        packedPosLength
            )
                return false
        } else if (this.ticksToLive > this.body.length * CREEP_SPAWN_TIME) return false

        // Record creep as isDying

        return true
    }

    update() {
        const packedCoord = Memory.creeps[this.name][CreepMemoryKeys.packedCoord]
        if (packedCoord) {
            if (this.isDying()) {
                this.room.roomManager.reserveCoord(packedCoord, ReservedCoordTypes.dying)
            } else {
                this.room.roomManager.reserveCoord(packedCoord, ReservedCoordTypes.important)
            }
        }
    }

    initRun(): void {
        if (randomTick() && !this.getActiveBodyparts(MOVE)) {
            this.suicide()
            return
        }

        if (!this.hasValidRemote()) {
            this.removeRemote()
            return
        }

        // We do have a valid remote

        this.remoteActions()
        this.applyRemote()

        return
    }

    hasValidRemote?() {
        const creepMemory = Memory.creeps[this.name]
        if (!creepMemory[CreepMemoryKeys.remote]) return false

        const remoteMemory = Memory.rooms[creepMemory[CreepMemoryKeys.remote]]

        if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.remote) return false
        if (remoteMemory[RoomMemoryKeys.commune] !== this.commune.name) return false
        if (remoteMemory[RoomMemoryKeys.abandonRemote]) return false
        if (remoteMemory[RoomMemoryKeys.enemyReserved]) return false

        return true
    }

    isRemoteValid?(remoteName: string, sourceIndex: number) {
        const remoteMemory = Memory.rooms[remoteName]

        if (remoteMemory[RoomMemoryKeys.enemyReserved]) return false
        if (remoteMemory[RoomMemoryKeys.abandonRemote]) return false
        // Make sure there are enough harvest positions for us
        if (
            this.commune.communeManager.remoteSourceHarvesters[remoteName][sourceIndex].length >=
            remoteMemory[RoomMemoryKeys.remoteSourceHarvestPositions][sourceIndex].length /
                packedPosLength
        )
            return false
        if (
            remoteMemory[RoomMemoryKeys.remoteSourceHarvesters][sourceIndex] * HARVEST_POWER <=
            remoteMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex]
        )
            return false

        return true
    }

    /**
     * Finds a remote to harvest in
     */
    findRemote?() {
        if (this.hasValidRemote()) return true

        for (const remoteInfo of this.commune.roomManager.remoteSourceIndexesByEfficacy) {
            const splitRemoteInfo = remoteInfo.split(' ')
            const remoteName = splitRemoteInfo[0]
            const remoteMemory = Memory.rooms[remoteName]
            if (remoteMemory[RoomMemoryKeys.type] !== RoomTypes.remote) continue
            if (remoteMemory[RoomMemoryKeys.commune] !== this.commune.name) continue

            const sourceIndex = parseInt(splitRemoteInfo[1])

            if (!this.isRemoteValid(remoteName, sourceIndex)) continue

            this.assignRemote(remoteName, sourceIndex)
            return true
        }

        return false
    }

    assignRemote?(remoteName: string, sourceIndex: number) {
        const creepMemory = Memory.creeps[this.name]
        creepMemory[CreepMemoryKeys.remote] = remoteName
        creepMemory[CreepMemoryKeys.sourceIndex] = sourceIndex

        delete creepMemory[CreepMemoryKeys.packedCoord]

        if (this.store.energy) this.drop(RESOURCE_ENERGY, this.store.energy)

        this.applyRemote()
    }

    /**
     * Apply response values to the remote
     */
    applyRemote?() {
        const creepMemory = Memory.creeps[this.name]
        const sourceIndex = creepMemory[CreepMemoryKeys.sourceIndex]
        const workParts = this.parts.work
        const remoteMemory = Memory.rooms[creepMemory[CreepMemoryKeys.remote]]
        /*
        if (!this.spawning) {

        }
        */
        if (this.room.name === creepMemory[CreepMemoryKeys.remote]) {
            if (!this.isDying()) {
                this.room.creepsOfSource[creepMemory[CreepMemoryKeys.sourceIndex]].push(this.name)
            }

            // We are in harvest range of the source
            const source = this.room.roomManager.remoteSources[sourceIndex]
            if (getRange(source.pos, this.pos) <= 1) {
                // manage remote needs

                // The smaller of the source path length or the creep's remaining lifetime
                const creditLifetime = Math.min(
                    remoteMemory[RoomMemoryKeys.remoteSourceFastFillerPaths].length /
                        packedPosLength,
                    this.ticksToLive,
                )

                const totalCreditChange = Math.min(
                    // Dont allow negative credit change
                    Math.max(
                        remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][sourceIndex] +
                            workParts * HARVEST_POWER,
                        0,
                    ),
                    remoteMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex],
                )

                // We probably need to account for how harvesters can harvest a source fully

                if (remoteMemory[RoomMemoryKeys.hasContainer][sourceIndex]) {
                    if (
                        remoteMemory[RoomMemoryKeys.remoteSourceCredit][sourceIndex] <
                        CONTAINER_CAPACITY
                    ) {
                        const creditChange = Math.min(
                            Math.min(
                                remoteMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex],
                                workParts * HARVEST_POWER,
                            ),
                            totalCreditChange,
                        )
                        remoteMemory[RoomMemoryKeys.remoteSourceCredit][sourceIndex] +=
                            creditChange * creditLifetime
                    }
                }
                // There is no container for the source
                else {
                    const creditChange = Math.min(
                        Math.min(
                            remoteMemory[RoomMemoryKeys.maxSourceIncome][sourceIndex],
                            workParts * HARVEST_POWER,
                        ),
                        totalCreditChange,
                    )
                    remoteMemory[RoomMemoryKeys.remoteSourceCredit][sourceIndex] +=
                        creditChange * creditLifetime
                }

                remoteMemory[RoomMemoryKeys.remoteSourceCreditChange][sourceIndex] =
                    totalCreditChange
            }
        }

        if (this.isDying()) return

        this.commune.communeManager.remoteSourceHarvesters[creepMemory[CreepMemoryKeys.remote]][
            sourceIndex
        ].push(this.name)
        remoteMemory[RoomMemoryKeys.remoteSourceHarvesters][sourceIndex] += workParts
    }

    removeRemote?() {
        const creepMemory = Memory.creeps[this.name]
        /*
        if (!this.isDying()) {
            const remoteName = creepMemory[CreepMemoryKeys.remote]

            Memory.rooms[remoteName][RoomMemoryKeys.remoteSourceHarvesters][
                this.memory[CreepMemoryKeys.sourceIndex]
            ] -= this.parts.work
        }
 */
        delete creepMemory[CreepMemoryKeys.remote]
        delete creepMemory[CreepMemoryKeys.packedCoord]
    }

    remoteActions?() {
        const creepMemory = Memory.creeps[this.name]

        // Make sure we are in the remote
        if (creepMemory[CreepMemoryKeys.remote] !== this.room.name) return Result.noAction

        // Try to move to source

        const sourceIndex = creepMemory[CreepMemoryKeys.sourceIndex]
        if (this.travelToSource(sourceIndex) !== Result.success) return Result.action

        // Make sure we're a bit ahead source regen time
        /*
        const sourcee = this.room.roomManager.remoteSources[this.memory[CreepMemoryKeys.sourceIndex]]

        this.room.visual.text((sourcee.energy * ENERGY_REGEN_TIME).toString() + ', ' + (sourcee.ticksToRegeneration * 0.9 * sourcee.energyCapacity).toString(), this.pos)
        */

        const container = this.room.roomManager.sourceContainers[sourceIndex]
        if (container) {
            // Repair or build the container if we're ahead on source regen

            if (this.maintainContainer(container) === Result.action) return Result.success

            const source = this.room.roomManager.remoteSources[sourceIndex]
            this.advancedHarvestSource(source)

            // Give our energy to the container so it doesn't drop on the ground

            if (
                getRange(this.pos, container.pos) === 1 &&
                this.store.getFreeCapacity() <= this.parts.work
            ) {
                this.transfer(container, RESOURCE_ENERGY)
            }

            return Result.success
        }

        // There is no container

        if (this.buildContainer() === Result.action) return Result.success

        const source = this.room.roomManager.remoteSources[sourceIndex]
        this.advancedHarvestSource(source)

        // Stop, we don't have enough energy to justify a request

        if (this.reserveStore.energy < this.store.getCapacity() * 0.5) return Result.action

        // Try to have haulers get energy directly from us (avoids decay)

        this.room.createRoomLogisticsRequest({
            target: this,
            type: RoomLogisticsRequestTypes.withdraw,
            priority: scalePriority(this.store.getCapacity(), this.reserveStore.energy, 5, true),
        })

        return Result.success
    }

    private obtainEnergyIfNeeded() {
        if (this.nextStore.energy >= this.parts.work) return Result.success
        if (this.movedResource) return Result.fail

        return this.runRoomLogisticsRequestAdvanced({
            resourceTypes: new Set([RESOURCE_ENERGY]),
            types: new Set<RoomLogisticsRequestTypes>([
                RoomLogisticsRequestTypes.withdraw,
                RoomLogisticsRequestTypes.pickup,
                RoomLogisticsRequestTypes.offer,
            ]),
            conditions: request => {
                getRange(findObjectWithID(request.targetID).pos, this.pos) <= 1
            },
        })
    }

    maintainContainer(container: StructureContainer): number {
        // Make sure we're a bit ahead source regen time

        const source = this.room.roomManager.remoteSources[this.memory[CreepMemoryKeys.sourceIndex]]
        if (
            source.energy * ENERGY_REGEN_TIME >
            source.ticksToRegeneration * source.energyCapacity * 0.9
        )
            return Result.noAction

        // Ensure we have enough energy to use all work parts

        if (this.store.energy < this.parts.work) return Result.noAction

        // Make sure the contianer is sufficiently needy of repair

        if (container.hits > container.hitsMax * 0.8) return Result.noAction
        if (this.obtainEnergyIfNeeded() !== Result.success) return Result.noAction

        this.repair(container)
        this.worked = WorkTypes.repair

        return Result.action
    }

    buildContainer(): number {
        // Don't build new remote containers until we can reserve the room
        if (!this.commune.communeManager.shouldRemoteContainers) return Result.noAction

        // Make sure we're a bit ahead source regen time

        const source = this.room.roomManager.remoteSources[this.memory[CreepMemoryKeys.sourceIndex]]
        if (
            source.energy * ENERGY_REGEN_TIME >
            source.ticksToRegeneration * source.energyCapacity * 0.9
        )
            return Result.noAction

        // Find an existing container construction site

        const cSite = this.room.findCSiteAtCoord(
            this.pos,
            cSite => cSite.structureType === STRUCTURE_CONTAINER,
        )

        if (cSite) {
            // Pick energy off the ground if possible

            if (this.obtainEnergyIfNeeded() !== Result.success) return Result.noAction

            // Don't allow the construction site manager to remove the site for while we're building

            Memory.constructionSites[cSite.id] = 0

            this.build(cSite)
            this.worked = WorkTypes.build

            return Result.action
        }

        // There is no container cSite, place one

        const sourcePos =
            this.room.roomManager.remoteSourceHarvestPositions[
                this.memory[CreepMemoryKeys.sourceIndex]
            ][0]
        this.room.createConstructionSite(sourcePos, STRUCTURE_CONTAINER)

        return Result.noAction
    }

    /**
     *
     */
    travelToSource?(sourceIndex: number): number {
        this.message = '🚬'

        // Unpack the harvestPos

        const harvestPos = this.findRemoteSourceHarvestPos(this.memory[CreepMemoryKeys.sourceIndex])
        if (!harvestPos) return Result.noAction

        this.actionCoord =
            this.room.roomManager.remoteSources[this.memory[CreepMemoryKeys.sourceIndex]].pos

        // If the creep is at the creep's packedHarvestPos, inform false

        if (getRange(this.pos, harvestPos) === 0) return Result.success

        // Otherwise say the intention and create a moveRequest to the creep's harvestPos, and inform the attempt

        this.message = `⏩ ` + sourceIndex

        this.createMoveRequestByPath(
            {
                origin: this.pos,
                goals: [
                    {
                        pos: harvestPos,
                        range: 0,
                    },
                ],
            },
            {
                packedPath: reversePosList(
                    Memory.rooms[this.memory[CreepMemoryKeys.remote]][
                        RoomMemoryKeys.remoteSourceFastFillerPaths
                    ][this.memory[CreepMemoryKeys.sourceIndex]],
                ),
                remoteName: this.memory[CreepMemoryKeys.remote],
            },
        )

        return Result.action
    }

    static roleManager(room: Room, creepsOfRole: string[]) {
        for (const creepName of creepsOfRole) {
            const creep: RemoteHarvester = Game.creeps[creepName] as RemoteHarvester

            // Try to find a remote

            if (!creep.findRemote()) {
                creep.message = '❌ Remote'
                /*
                // If the room is the creep's commune

                if (room.name === creep.commune.name) {
                    // Advanced recycle and iterate

                    creep.advancedRecycle()
                    continue
                }

                // Otherwise, have the creep make a moveRequest to its commune and iterate

                creep.createMoveRequest({
                    origin: creep.pos,
                    goals: [
                        {
                            pos: creep.commune.anchor,
                            range: 5,
                        },
                    ],
                })
 */
                continue
            }

            // If the creep needs resources

            if (room.name === creep.memory[CreepMemoryKeys.remote]) {
                /* creep.remoteActions() */
                continue
            }

            creep.message = creep.memory[CreepMemoryKeys.remote]

            const sourcePos = unpackPosAt(
                Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
                    RoomMemoryKeys.remoteSourceHarvestPositions
                ][creep.memory[CreepMemoryKeys.sourceIndex]],
            )

            creep.createMoveRequestByPath(
                {
                    origin: creep.pos,
                    goals: [
                        {
                            pos: sourcePos,
                            range: 1,
                        },
                    ],
                    avoidEnemyRanges: true,
                    typeWeights: {
                        [RoomTypes.enemy]: Infinity,
                        [RoomTypes.ally]: Infinity,
                        [RoomTypes.sourceKeeper]: Infinity,
                        [RoomTypes.enemyRemote]: Infinity,
                        [RoomTypes.allyRemote]: Infinity,
                    },
                    avoidDanger: true,
                },
                {
                    packedPath: reversePosList(
                        Memory.rooms[creep.memory[CreepMemoryKeys.remote]][
                            RoomMemoryKeys.remoteSourceFastFillerPaths
                        ][creep.memory[CreepMemoryKeys.sourceIndex]],
                    ),
                    remoteName: creep.memory[CreepMemoryKeys.remote],
                },
            )
        }
    }
}
