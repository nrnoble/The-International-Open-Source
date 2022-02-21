// Define roomObject types

import { generalFuncs } from "international/generalFunctions"

export type RoomObjectValueTypes = 'pos' |
'id' |
'object'

export type RoomObjectCacheTypes = 'global' |
'memory' | 'property'

export interface RoomObjectOpts {
    [key: string]: any
    name: RoomObjectName,
    valueType: RoomObjectValueTypes,
    cacheType: RoomObjectCacheTypes,
    cacheAmount?: number
    room: Room

    //

    valueConstructor(): any
}

export interface RoomObject extends RoomObjectOpts {

    lastCache?: number
    value: any

    // Functions

    formatValue(): void

    getCachedValue(): void

    getValue(): any

    cache(): void
}

export class RoomObject {
    constructor(opts: RoomObjectOpts) {

        const roomObject = this

        // Assign opts as properties

        for (const propertyName in opts) roomObject[propertyName] = opts[propertyName]

        // Record the roomObject in the room's roomObjects

        roomObject.room.roomObjects[roomObject.name] = roomObject
    }
}

RoomObject.prototype.formatValue = function() {

    const roomObject = this
    const room = roomObject.room

    // If roomObject's valueType is an ID

    if (roomObject.valueType == 'id') {

        // Assign its value to the object with the ID and stop

        roomObject.value = generalFuncs.findObjectWithID(roomObject.value)
        return
    }

    // If roomObject's type is pos

    if (roomObject.valueType == 'pos') {

        // Stop if the roomObject's value isn't defined

        if (!roomObject.value) return

        // Otherwise assign its value as a new RoomPosition and stop

        roomObject.value = room.newPos(roomObject.value)
        return
    }
}

RoomObject.prototype.getCachedValue = function() {

    const roomObject = this
    const room = roomObject.room

    if (roomObject.cacheType == 'memory') {

        // Query room memory for cachedRoomObject

        const cachedValue: any = room.memory[roomObject.name]

        // If cachedRoomObject doesn't exist, stop

        if (!cachedValue) return

        // Otherwise assign the cachedValue to the roomObject

        roomObject.value = cachedValue

        // Format the value and stop

        roomObject.formatValue()
        return
    }

    if (roomObject.cacheType == 'global') {

        // Query room's global for cachedRoomObject

        const cachedRoomObject: RoomObject = global[room.name][roomObject.name]

        // If cachedRoomObject doesn't exist, stop

        if (!cachedRoomObject) return

        // If cachedRoomObject is past renewal date, stop

        if (cachedRoomObject.lastCache + roomObject.cacheAmount >= Game.time) return

        // Otherwise assign the cachedRoomObject's value to the roomObject

        roomObject.value = cachedRoomObject.value

        // Format the roomObject's value and stop

        roomObject.formatValue()
        return
    }
}

RoomObject.prototype.getValue = function() {

    const roomObject = this

    // Try to get the roomObject's cached value

    roomObject.getCachedValue()

    // If the result is a valid cached value, inform it

    if (roomObject.value) return roomObject.value

    // Otherwise run the value constructor and set it as the roomObject's value

    roomObject.value = roomObject.valueConstructor()

    // Cache the value, and inform it

    roomObject.cache()
    return roomObject.value
}

RoomObject.prototype.cache = function() {

    const roomObject = this
    const room = roomObject.room

    // Add roomObject to roomObjects

    room.roomObjects[roomObject.name] = roomObject

    // If cacheMethod is memory

    if (roomObject.cacheType == 'memory') {

        // Store value in room's memory and stop

        room.memory[roomObject.name] = roomObject.value
        return
    }

    // If cacheMethod is global

    if (roomObject.cacheType == 'global') {

        // Store the roomObject in global and stop

        global[room.name][roomObject.name] = roomObject
        return
    }
}
