module.exports = {
    run: function(creep) {

        const remoteRoom = creep.memory.remoteRoom
        const roomFrom = creep.memory.roomFrom

        creep.isFull()

        if (creep.memory.isFull) {

            if (creep.room.name == remoteRoom) {

                let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: s => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= creep.store.getCapacity()
                })

                if (container) {

                    creep.say("🛄")

                    creep.advancedWithdraw(container)

                } else {

                    let droppedResources = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
                        filter: (s) => s.resourceType == RESOURCE_ENERGY && s.energy >= creep.store.getCapacity() * 0.5
                    });

                    if (droppedResources) {

                        creep.say("💡")

                        creep.pickupDroppedEnergy(droppedResources)

                    } else {

                        let closestSource = creep.pos.findClosestByRange(FIND_SOURCES)

                        creep.say("🔦")

                        if (creep.pos.getRangeTo(closestSource) > 3) {

                            let goal = _.map([closestSource], function(target) {
                                return { pos: target.pos, range: 1 }
                            })

                            creep.intraRoomPathing(creep.pos, goal)
                        } else {

                            let goal = _.map([closestSource], function(target) {
                                return { pos: target.pos, range: 3 }
                            })

                            creep.creepFlee(creep.pos, goal)
                        }
                    }
                }
            } else {

                let goal = _.map([new RoomPosition(25, 25, remoteRoom)], function(target) {
                    return { pos: target, range: 24 }
                })

                creep.onlySafeRoomPathing(creep.pos, goal, ["enemyRoom", "keeperRoom", "enemyReservation"])
            }
        } else {

            if (creep.room.name == roomFrom) {

                if (creep.room.storage && storage.store[RESOURCE_ENERGY] < 40000 && storage.store.getCapacity() >= creep.store.getUsedCapacity()) {

                    creep.say("S");

                    creep.advancedTransfer(creep.room.storage)

                } else {

                    if (creep.room.storage && storage.store[RESOURCE_ENERGY] < 40000 && storage.store.getCapacity() >= creep.store.getUsedCapacity()) {

                        creep.say("S");

                        creep.advancedTransfer(creep.room.storage)

                    } else {

                        if (creep.room.terminal && terminal.store[RESOURCE_ENERGY] < 40000 && terminal.store.getCapacity() >= creep.store.getUsedCapacity()) {

                            creep.say("S");

                            creep.advancedTransfer(creep.room.terminal)

                        } else {

                            let essentialStructure = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                                filter: (s) => (s.structureType == STRUCTURE_EXTENSION ||
                                        s.structureType == STRUCTURE_SPAWN ||
                                        s.structureType == STRUCTURE_TOWER && s.energy < 710) &&
                                    s.energy < s.energyCapacity
                            })

                            if (essentialStructure) {

                                creep.room.visual.text("☀️", essentialStructure.pos.x, essentialStructure.pos.y + 0.25, { align: 'center' })

                                if (creep.advancedTransfer(essentialStructure) == 0) {

                                    let structureToMoveTo = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                                        filter: (s) => (s.structureType == STRUCTURE_EXTENSION ||
                                                s.structureType == STRUCTURE_SPAWN ||
                                                s.structureType == STRUCTURE_TOWER && s.energy < 710) &&
                                            s.energy < s.energyCapacity && s.id != essentialStructure.id
                                    })

                                    if (structureToMoveTo) {

                                        if (structureToMoveTo.pos.getRangeTo(creep) > 1) {

                                            let goal = _.map([structureToMoveTo], function(target) {
                                                return { pos: target.pos, range: 1 }
                                            })

                                            creep.intraRoomPathing(creep.pos, goal)
                                        }
                                    }
                                }
                            } else {

                                let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS)

                                creep.say("S")

                                if (spawn && creep.pos.getRangeTo(spawn) > 5) {

                                    let goal = _.map([spawn], function(target) {
                                        return { pos: target.pos, range: 5 }
                                    })

                                    creep.intraRoomPathing(creep.pos, goal)
                                }
                            }
                        }
                    }
                }
            } else {

                let goal = _.map([new RoomPosition(25, 25, roomFrom)], function(target) {
                    return { pos: target, range: 24 }
                })

                creep.onlySafeRoomPathing(creep.pos, goal, ["enemyRoom", "keeperRoom", "enemyReservation"])
            }
        }

        creep.avoidHostiles()
    }
}