import { Result, customColors, PowerCreepMemoryKeys } from 'international/constants'
import { PowerTask } from 'types/roomRequests'
import { customLog } from 'utils/logging'
import { findObjectWithID, getRange } from 'utils/utils'

export class Operator extends PowerCreep {
    constructor(creepID: Id<PowerCreep>) {
        super(creepID)
    }

    initRun() {
        this.managePowerTask()
        this.avoidEnemyThreatCoords()
    }

    managePowerTask?() {
        if (!this.memory[PowerCreepMemoryKeys.taskTarget]) return

        const taskTarget = findObjectWithID(this.memory[PowerCreepMemoryKeys.taskTarget])
        if (!taskTarget) {
            delete this.memory[PowerCreepMemoryKeys.taskTarget]
            return
        }

        // Don't have the taskTarget thinking it needs a new task

        taskTarget.reservePowers
        taskTarget._reservePowers.add(this.memory[PowerCreepMemoryKeys.taskPower])
    }

    endRun() {}

    // Basic tasks

    runTask?() {
        if (!this.memory[PowerCreepMemoryKeys.task] && !this.findTask()) return Result.fail

        const taskResult = (this as any)[this.memory[PowerCreepMemoryKeys.task]]()
        if (!taskResult) return taskResult === Result.fail

        delete this.memory[PowerCreepMemoryKeys.task]
        return Result.success
    }

    findTask?() {
        if (this.findRenewTask()) return true
        if (this.findEnablePowerTask()) return true
        if (this.findGenerateOpsTask()) return true
        return false
    }

    findRenewTask?() {
        if (this.ticksToLive > POWER_CREEP_LIFE_TIME * 0.1) return false

        if (!this.room.roomManager.powerSpawn) return false

        this.memory[PowerCreepMemoryKeys.task] = 'advancedRenew'
        return true
    }

    advancedRenew?() {
        const powerSpawn = this.room.roomManager.powerSpawn
        if (!powerSpawn) return Result.fail

        const minRange = 1
        if (getRange(this.pos, powerSpawn.pos) > minRange) {
            this.createMoveRequest({
                origin: this.pos,
                goals: [
                    {
                        pos: powerSpawn.pos,
                        range: minRange,
                    },
                ],
                avoidEnemyRanges: true,
            })

            return false
        }

        this.renew(powerSpawn)
        return true
    }

    findEnablePowerTask?() {
        const { controller } = this.room
        if (!controller) return false

        if (controller.isPowerEnabled) return false

        this.memory[PowerCreepMemoryKeys.task] = 'advancedEnablePower'
        return true
    }

    advancedEnablePower?() {
        const { controller } = this.room
        if (!controller || controller.isPowerEnabled) return Result.noAction

        const minRange = 1
        if (getRange(this.pos, controller.pos) > minRange) {
            this.createMoveRequest({
                origin: this.pos,
                goals: [
                    {
                        pos: controller.pos,
                        range: minRange,
                    },
                ],
                avoidEnemyRanges: true,
            })

            return Result.action
        }

        this.enableRoom(controller)
        return Result.success
    }

    findGenerateOpsTask?() {
        if (this.powered) return false

        const power = this.powers[PWR_GENERATE_OPS]
        if (!power) return false

        if (power.cooldown) return false

        this.memory[PowerCreepMemoryKeys.task] = 'advancedGenerateOps'
        return true
    }

    advancedGenerateOps?() {
        this.message = 'AGO'

        if (this.powered) return false

        this.usePower(PWR_GENERATE_OPS)
        this.powered = true
        return true
    }

    // Complex power tasks

    findPowerTask?() {
        if (this.memory[PowerCreepMemoryKeys.taskTarget])
            return findObjectWithID(this.memory[PowerCreepMemoryKeys.taskTarget])

        const task = this.findNewBestPowerTask()
        if (!task) return Result.fail

        customLog('FIND TASK', findObjectWithID(task.targetID))

        const taskTarget = findObjectWithID(task.targetID)
        taskTarget.reservePowers
        taskTarget._reservePowers.add(this.memory[PowerCreepMemoryKeys.taskPower])

        this.memory[PowerCreepMemoryKeys.taskTarget] = task.targetID
        this.memory[PowerCreepMemoryKeys.taskPower] = task.powerType
        delete this.room.powerTasks[task.taskID]

        return findObjectWithID(task.targetID)
    }

    findNewBestPowerTask?() {
        let lowestScore = Infinity
        let bestTask: PowerTask

        for (const ID in this.room.powerTasks) {
            const task = this.room.powerTasks[ID]

            // We don't have the requested power

            const power = this.powers[task.powerType]
            if (!power) continue

            // We don't have enough ops for the task

            if ((POWER_INFO[task.powerType] as any).ops > this.nextStore.ops) continue

            const taskTargetPos = findObjectWithID(task.targetID).pos
            const range = getRange(this.pos, taskTargetPos)

            // The target doesn't need us yet or we can't yet provide

            if (
                Math.max(task.cooldown, this.powerCooldowns.get(task.powerType) || 0) >
                range + (POWER_INFO[task.powerType] as any).range + 3
            )
                continue

            const score = task.priority + range / 100

            if (score >= lowestScore) continue

            lowestScore = score
            bestTask = task
        }

        return bestTask
    }

    runPowerTask?() {
        const taskTarget = this.findPowerTask()
        if (!taskTarget) return Result.fail

        // We aren't in range, get closer
        customLog('TRY TASK', taskTarget)
        const minRange = (POWER_INFO[this.memory[PowerCreepMemoryKeys.taskPower]] as any).range
        if (minRange && getRange(this.pos, taskTarget.pos) > minRange) {
            this.createMoveRequest({
                origin: this.pos,
                goals: [{ pos: taskTarget.pos, range: minRange }],
            })
            return Result.action
        }

        // We can't or failed the power

        if (this.powered) return Result.fail

        const effect = taskTarget.effectsData.get(this.memory[PowerCreepMemoryKeys.taskPower])
        if (effect && effect.ticksRemaining > 0) return Result.fail
        /* if (this.usePower(this.memory[PowerCreepMemoryKeys.taskPower], taskTarget) !== OK) return Result.fail */

        this.usePower(this.memory[PowerCreepMemoryKeys.taskPower], taskTarget)

        // We did the power
        customLog('WE DID THE POWA', taskTarget)

        // Assume the power consumed ops if it does so

        const ops = (POWER_INFO[this.memory[PowerCreepMemoryKeys.taskPower]] as any).ops
        if (ops) this.nextStore.ops -= ops

        this.powered = true
        delete this.memory[PowerCreepMemoryKeys.taskTarget]

        // Define the cooldown so we don't assume the creep can still do this power immediately

        this.powerCooldowns
        this._powerCooldowns.set(
            this.memory[PowerCreepMemoryKeys.taskPower],
            POWER_INFO[this.memory[PowerCreepMemoryKeys.taskPower]].cooldown,
        )

        return Result.success
    }

    static operatorManager(room: Room, creepsOfRole: string[]) {
        // Loop through creep names of this role

        for (const creepName of creepsOfRole) {
            // Get the creep using its name

            const creep: Operator = Game.powerCreeps[creepName]

            if (creep.runTask()) continue
            if (creep.runPowerTask() === Result.success) creep.runPowerTask()
        }
    }
}
