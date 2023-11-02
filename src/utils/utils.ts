import { ErrorMapper } from 'other/ErrorMapper'
import {
    mmoShardNames,
    customColors,
    offsetsByDirection,
    roomDimensions,
    roomTypeProperties,
    roomTypes,
    allStructureTypes,
    dynamicScoreRoomRange,
    maxControllerLevel,
    preferredCommuneRange,
    RoomMemoryKeys,
    RoomTypes,
    PlayerMemoryKeys,
    CPUMaxPerTick,
} from '../international/constants'
import { collectiveManager } from '../international/collective'
import { debugUtils } from 'debug/debugUtils'
import { LogTypes, customLog } from './logging'

/**
 * Finds the average trading price of a resourceType over a set amount of days
 */
export function getAvgPrice(resourceType: MarketResourceConstant, days = 2) {
    // Get the market history for the specified resourceType

    const history = Game.market.getHistory(resourceType)
    if (!history.length) return 1

    // Init the totalPrice

    let totalPrice = 0

    // Iterate through each index less than days

    for (let index = 0; index <= days; index += 1) {
        if (!history[index]) continue
        totalPrice += history[index].avgPrice
    }

    // Inform the totalPrice divided by the days

    return totalPrice / days
}

/**
 * Uses a provided ID to find an object associated with it
 */
export function findObjectWithID<T extends Id<any>>(ID: T): fromId<T> | undefined {
    return Game.getObjectById(ID) || undefined
}

/**
 * Check if an x and y are valid when mapped onto a room
 */
export function doesXYExist(x: number, y: number) {
    return x >= 0 && x < roomDimensions && y >= 0 && y < roomDimensions
}

/**
 * Check if a coord is valid when mapped onto a room
 */
export function doesCoordExist(coord: Coord) {
    return coord.x >= 0 && coord.x < roomDimensions && coord.y >= 0 && coord.y < roomDimensions
}

/**
 * Takes a rectange and returns the coords inside of it in an array
 */
export function findCoordsInsideRect(x1: number, y1: number, x2: number, y2: number) {
    const coords: Coord[] = []

    for (let x = x1; x <= x2; x += 1) {
        for (let y = y1; y <= y2; y += 1) {
            // Iterate if the pos doesn't map onto a room

            if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions) continue

            // Otherwise pass the x and y to positions

            coords.push({ x, y })
        }
    }

    return coords
}

/**
 * Takes a coord and returns the coords inside of it in an array
 */
export function findCoordsInRangeXY(startX: number, startY: number, range: number) {
    const coords: Coord[] = []

    for (let x = startX - range; x <= startX + range; x += 1) {
        for (let y = startY - range; y <= startY + range; y += 1) {
            // Iterate if the pos doesn't map onto a room

            if (startX < 0 || startX >= roomDimensions || startY < 0 || startY >= roomDimensions)
                continue

            // Otherwise pass the x and y to positions

            coords.push({ x, y })
        }
    }

    return coords
}

/**
 * Takes a coord and returns the positions inside of it in an array
 */
export function findCoordsInRange(coord: Coord, range: number) {
    return findCoordsInRangeXY(coord.x, coord.y, range)
}

export function findAdjacentCoordsToXY(x: number, y: number) {
    const positions: Coord[] = []

    for (let i = x - 1; i <= x + 1; i += 1) {
        for (let j = y - 1; j <= y + 1; j += 1) {
            // Iterate if the pos doesn't map onto a room

            if (i < 0 || i >= roomDimensions || j < 0 || j >= roomDimensions) continue

            if (x === i && y === j) continue

            // Otherwise pass the x and y to positions

            positions.push({ x: i, y: j })
        }
    }

    return positions
}

export function findAdjacentCoordsToCoord(coord: Coord) {
    return findAdjacentCoordsToXY(coord.x, coord.y)
}

/**
 * Checks if two coords are equal
 */
export function areCoordsEqual(coord1: Coord, coord2: Coord) {
    return coord1.x === coord2.x && coord1.y === coord2.y
}

/**
 * Checks if two positions are equal
 */
export function arePositionsEqual(pos1: RoomPosition, pos2: RoomPosition) {
    return pos1.roomName === pos2.roomName && pos1.x === pos2.x && pos1.y === pos2.y
}

/**
 * Incrememnts Memory.ID and informs the result
 * @returns an incremented ID
 */
export function newID() {
    return (Memory.ID += 1).toString()
}

interface AdvancedFindDistanceOpts {
    typeWeights?: { [key: string]: number }
    avoidDanger?: boolean
}

/**
 * Finds the distance between two rooms based on walkable exits while avoiding rooms with specified types
 */
export function advancedFindDistance(
    originRoomName: string,
    goalRoomName: string,
    opts: AdvancedFindDistanceOpts = {},
) {
    // Try to find a route from the origin room to the goal room

    const findRouteResult = Game.map.findRoute(originRoomName, goalRoomName, {
        routeCallback(roomName) {
            const roomMemory = Memory.rooms[roomName]
            if (!roomMemory) {
                if (roomName === goalRoomName) return 1
                return 50
            }

            if (opts.avoidDanger && roomMemory[RoomMemoryKeys.type] === RoomTypes.remote) {
                if (roomMemory[RoomMemoryKeys.abandonRemote]) {
                    return 30
                }
            }

            // If the goal is in the room

            if (roomName === goalRoomName) return 1

            // If the type is in typeWeights, inform the weight for the type

            if (opts.typeWeights && opts.typeWeights[roomMemory[RoomMemoryKeys.type]])
                return opts.typeWeights[roomMemory[RoomMemoryKeys.type]]

            return 1
        },
    })

    // If findRouteResult didn't work, inform a path length of Infinity

    if (findRouteResult === ERR_NO_PATH) return Infinity

    // inform the path's length

    return findRouteResult.length
}

/**
 *
 * @param distance The number of tiles between the hauling target and source
 * @param income The number of resources added to the pile each tick
 */
export function findCarryPartsRequired(distance: number, income: number) {
    return Math.ceil((distance * 2 * income) / CARRY_CAPACITY)
}

export function findLinkThroughput(range: number, income: number = LINK_CAPACITY) {
    return Math.min(LINK_CAPACITY / range, income) * (1 - LINK_LOSS_RATIO)
}

/**
 * Finds a position equally between two positions
 */
export function findAvgBetweenCoords(pos1: Coord, pos2: Coord) {
    // Inform the rounded average of the two positions

    return {
        x: Math.floor((pos1.x + pos2.x) / 2),
        y: Math.floor((pos1.y + pos2.y) / 2),
    }
}

/**
 * Gets the range between two positions' x and y (Half Manhattan)
 * @param x1 the first position's x
 * @param y1 the first position's y
 * @param x2 the second position's x
 * @param y2 the second position's y
 */
export function getRangeXY(x1: number, x2: number, y1: number, y2: number) {
    // Find the range using Chebyshev's formula

    return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
}

export function getRange(coord1: Coord, coord2: Coord) {
    return getRangeXY(coord1.x, coord2.x, coord1.y, coord2.y)
}

/**
 * Finds the closest object with a position to a given target, by range (Half Manhattan)
 */
export function findClosestObject<T extends _HasRoomPosition>(
    target: RoomPosition | Coord,
    objects: T[],
) {
    let minRange = Infinity
    let closest = undefined

    for (const object of objects) {
        const range = getRangeXY(target.x, object.pos.x, target.y, object.pos.y)

        if (range > minRange) continue

        minRange = range
        closest = object
    }

    return closest
}

/**
 * Finds the closest object with a position to a given target, by range, in a specified range (Half Manhattan)
 */
export function findClosestObjectInRange<T extends _HasRoomPosition>(
    target: RoomPosition | Coord,
    objects: T[],
    range: number,
) {
    let minRange = Infinity
    let closest = undefined

    for (const object of objects) {
        const range = getRangeXY(target.x, object.pos.x, target.y, object.pos.y)

        if (range > minRange) continue

        minRange = range
        closest = object
    }

    // Inform the closest object, if within range

    if (minRange <= range) return closest
    return false
}

/**
 * Finds the closest position to a given target (Half Manhattan)
 */
export function findClosestCoord(
    target: RoomPosition | Coord,
    positions: Coord[],
): [Coord, number] {
    let minRange = Infinity
    let closestI = 0

    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i]
        const range = getRangeXY(target.x, pos.x, target.y, pos.y)

        if (range > minRange) continue

        minRange = range
        closestI = i
    }

    return [positions[closestI], closestI]
}

/**
 * Finds the closest position to a given target (Half Manhattan)
 */
export function findClosestPos(target: RoomPosition | Coord, positions: RoomPosition[]) {
    let minRange = Infinity
    let closest = undefined

    for (const pos of positions) {
        const range = getRangeXY(target.x, pos.x, target.y, pos.y)

        if (range > minRange) continue

        minRange = range
        closest = pos
    }

    return closest
}

/**
 * Gets the range between two positions' x and y (Euclidean)
 */
export function getRangeEucXY(x1: number, x2: number, y1: number, y2: number) {
    // Find the range using Chebyshev's formula

    return Math.round(Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) * 10) / 10
}

export function getRangeEuc(coord1: Coord, coord2: Coord) {
    return getRangeEucXY(coord1.x, coord2.x, coord1.y, coord2.y)
}

/**
 * Finds the closest object with a position to a given target (Euclidean)
 */
export function findClosestObjectEuc<T extends _HasRoomPosition>(
    target: RoomPosition | Coord,
    objects: T[],
) {
    let minRange = Infinity
    let closest = undefined

    for (const object of objects) {
        const range = getRangeEucXY(target.x, object.pos.x, target.y, object.pos.y)

        if (range >= minRange) continue

        minRange = range
        closest = object
    }

    return closest
}

/**
 * Finds the closest object with a position to a given target (Euclidean)
 */
export function findFurthestObjectEuc<T extends _HasRoomPosition>(
    target: RoomPosition | Coord,
    objects: T[],
) {
    let maxRange = Infinity
    let furthest = undefined

    for (const object of objects) {
        const range = getRangeEucXY(target.x, object.pos.x, target.y, object.pos.y)

        if (range <= maxRange) continue

        maxRange = range
        furthest = object
    }

    return furthest
}

/**
 * Finds the closest position to a given target (Euclidean)
 */
export function findClosestPosEuc<T extends RoomPosition | Coord>(
    target: RoomPosition | Coord,
    positions: T[],
) {
    let minRange = Infinity
    let closest = undefined

    for (const pos of positions) {
        const range = getRangeEucXY(target.x, pos.x, target.y, pos.y)

        if (range >= minRange) continue

        minRange = range
        closest = pos
    }

    return closest
}

export function findCPUColor(): string {
    const CPU = Game.cpu.getUsed()

    // Inform color based on percent of cpu used of limit

    if (CPU > Game.cpu.limit * 0.6) return customColors.green
    if (CPU > Game.cpu.limit * 0.9) return customColors.green
    return customColors.green
}

export function createPosMap(innerArray?: boolean, initialValue?: string | number) {
    // Construct the position map

    const packedPosMap: PosMap<any> = []

    // Loop through each x and y in the room

    for (let x = 0; x < roomDimensions; x += 1) {
        for (let y = 0; y < roomDimensions; y += 1) {
            // Add an element for this pos

            packedPosMap.push(innerArray ? [] : initialValue)
        }
    }

    // Inform the position map

    return packedPosMap
}

export function packAsNum(pos: Coord) {
    // Inform a packed pos

    return pos.x * roomDimensions + pos.y
}

export function packXYAsNum(x: number, y: number) {
    // Inform a packed pos

    return x * roomDimensions + y
}

export function unpackNumAsCoord(packedCoord: number) {
    // Inform an unpacked pos

    return {
        x: Math.floor(packedCoord / roomDimensions),
        y: Math.floor(packedCoord % roomDimensions),
    }
}

export function unpackNumAsPos(packedPos: number, roomName: string) {
    // Inform an unpacked RoomPosition

    return new RoomPosition(
        Math.floor(packedPos / roomDimensions),
        Math.floor(packedPos % roomDimensions),
        roomName,
    )
}

export function findCreepInQueueMatchingRequest(queue: string[], requestPackedPos: number) {
    // Loop through each creepName of the queue

    for (const creepName of queue) {
        // Get the creep using the creepName

        const queuedCreep = Game.creeps[creepName]

        // If the queuedCreep's pos is equal to the moveRequest, inform the creep

        if (packAsNum(queuedCreep.pos) === requestPackedPos) return queuedCreep
    }

    return undefined
}

export function findClosestRoomName(start: string, targets: string[]) {
    let minRange = Infinity
    let closest = undefined

    for (const target of targets) {
        const range = Game.map.getRoomLinearDistance(start, target)

        if (range > minRange) continue

        minRange = range
        closest = target
    }

    return closest
}

/**
 * Generatesa a random integer between two thresholds
 */
export function randomIntRange(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min)
}

export function findCPUOf(func: Function) {
    const CPU = Game.cpu.getUsed()

    func()

    customLog('CPU for ' + func.name, Game.cpu.getUsed() - CPU)
}

export function isXYExit(x: number, y: number) {
    return x <= 0 || x >= roomDimensions - 1 || y <= 0 || y >= roomDimensions - 1
}

export function isExit(coord: Coord) {
    return (
        coord.x <= 0 ||
        coord.x >= roomDimensions - 1 ||
        coord.y <= 0 ||
        coord.y >= roomDimensions - 1
    )
}

export function randomTick(max: number = 20) {
    return Game.time % Math.floor(Math.random() * max) === 0
}

export function randomChance(number: number = 10) {
    return Math.floor(Math.random() * number) === number
}

export function randomRange(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min)
}

export function isNearRoomEdge(coord: Coord, minRange: number) {
    if (coord.x <= minRange) return true
    if (coord.x - roomDimensions - 1 <= minRange) return true
    if (coord.y <= minRange) return true
    if (coord.y - roomDimensions - 1 <= minRange) return true
    return false
}

/**
 * Increases priority as a percentage of capacity used
 * @param reverse Decreases priority as a percentage of capacity used
 */
export function scalePriority(
    capacity: number,
    amount: number,
    multiplier: number = 1,
    reverse?: boolean,
) {
    if (reverse) {
        return (1 - amount / capacity) * multiplier
    }

    return (amount / capacity) * multiplier
}

export function makeRoomCoord(roomName: string) {
    // Find the numbers in the room's name

    let [name, cx, x, cy, y] = roomName.match(/^([WE])([0-9]+)([NS])([0-9]+)$/)

    return {
        x: cx === 'W' ? ~x : parseInt(x),
        y: cy === 'S' ? ~y : parseInt(y),
    }
}

export function roomNameFromRoomXY(x: number, y: number) {
    return (
        (x < 0 ? 'W' + String(~x) : 'E' + String(x)) + (y < 0 ? 'S' + String(~y) : 'N' + String(y))
    )
}

export function roomNameFromRoomCoord(roomCoord: RoomCoord) {
    return roomNameFromRoomXY(roomCoord.x, roomCoord.y)
}

export function forRoomNamesInRangeXY(
    startX: number,
    startY: number,
    range: number,
    f: (x: number, y: number) => void,
) {
    for (let x = startX - range; x <= startX + range; x += 1) {
        for (let y = startY - range; y <= startY + range; y += 1) {
            if (startX === x && startY === y) continue
            f(x, y)
        }
    }
}

export function forRoomNamesAroundRangeXY(
    startX: number,
    startY: number,
    range: number,
    f: (x: number, y: number) => void,
) {
    for (let x = startX - range; x <= startX + range; x += 1) {
        for (let y = startY - range; y <= startY + range; y += 1) {
            if (startX === x && startY === y) continue

            f(x, y)
        }
    }
}

export function isXYInRoom(x: number, y: number) {
    return x >= 0 && x < roomDimensions && y >= 0 && y < roomDimensions
}

export function isXYInBorder(x: number, y: number, inset: number) {
    return (
        x > inset && x < roomDimensions - 1 - inset && y > inset && y < roomDimensions - 1 - inset
    )
}

export function roundTo(num: number, decimals: number) {
    return parseFloat(num.toFixed(decimals))
}

/**
 * Ripped from @external https://github.com/Mirroar/hivemind
 * Runs a callback within a try/catch block while using the ErrorMapper to trace error
 *
 * @param {function} callback The callback to run.
 * @return {mixed} Whatever the original fuction returns.
 */
export function tryErrorMapped<T>(callback: () => T): T {
    try {
        return callback()
    } catch (error: any) {
        let stackTrace = error.stack
        if (error instanceof Error) {
            stackTrace = _.escape(ErrorMapper.sourceMappedStackTrace(error))
        }

        console.log('<span style="color:red">' + error.name + stackTrace + '</span>')
    }

    return undefined
}

export function forAdjacentCoords(startCoord: Coord, f: (near: Coord) => void) {
    for (let x = startCoord.x - 1; x <= startCoord.x + 1; x += 1) {
        for (let y = startCoord.y - 1; y <= startCoord.y + 1; y += 1) {
            if (x == startCoord.x && y === startCoord.y) continue
            if (isXYExit(x, y)) continue

            f({ x, y })
        }
    }
}

/**
 * Excludes center around range
 */
export function forCoordsAroundRange(startCoord: Coord, range: number, f: (coord: Coord) => void) {
    for (let x = startCoord.x - range; x <= startCoord.x + range; x += 1) {
        for (let y = startCoord.y - range; y <= startCoord.y + range; y += 1) {
            if (x == startCoord.x && y === startCoord.y) continue
            // Iterate if the pos doesn't map onto a room

            if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions) continue

            f({ x, y })
        }
    }
}

/**
 * includes center around range
 */
export function forCoordsInRange(startCoord: Coord, range: number, f: (coord: Coord) => void) {
    for (let x = startCoord.x - range; x <= startCoord.x + range; x += 1) {
        for (let y = startCoord.y - range; y <= startCoord.y + range; y += 1) {
            // Iterate if the pos doesn't map onto a room

            if (x < 0 || x >= roomDimensions || y < 0 || y >= roomDimensions) continue

            f({ x, y })
        }
    }
}

export function randomVal(array: any[]) {
    return array[randomIntRange(0, array.length)]
}

export function findRangeFromExit(coord: Coord) {
    const dx = Math.min(coord.x, roomDimensions - 1 - coord.x)
    const dy = Math.min(coord.y, roomDimensions - 1 - coord.y)
    return Math.min(dx, dy)
}

/**
 * Finds the weighted range of a coord from an exit, where the weight effects values
 */
export function findWeightedRangeFromExit(coord: Coord, weight: number) {
    const dx = Math.min(coord.x, roomDimensions - 1 - coord.x)
    const dy = Math.min(coord.y, roomDimensions - 1 - coord.y)
    const weightedRange = Math.pow(Math.min(dx, dy), weight)

    return roundTo(weightedRange, 2)
}

/**
 * @example splitAt('foo, 1), // ["f", "oo"]
 */
export function splitStringAt(string: string, index: number) {
    return [string.slice(0, index), string.slice(index)]
}

export function findHighestScore<T>(iter: T[], f: (val: T) => number | false): number {
    let highestScore = 0

    for (const val of iter) {
        const score = f(val)
        if (score === false) continue
        if (score <= highestScore) continue

        highestScore = score
    }

    return highestScore
}

export function findWithHighestScore<T>(
    iter: T[],
    f: (val: T) => number | false,
): [number, T | undefined] {
    let highestScore = 0
    let bestVal: T | undefined

    for (const val of iter) {
        const score = f(val)
        if (score === false) continue
        if (score <= highestScore) continue

        highestScore = score
        bestVal = val
    }

    return [highestScore, bestVal]
}

export function findLowestScore<T>(iter: T[], f: (val: T) => number | false): number {
    let lowestScore = Infinity

    for (const val of iter) {
        const score = f(val)
        if (score === false) continue
        if (score >= lowestScore) continue

        lowestScore = score
    }

    return lowestScore
}

export function findWithLowestScore<T>(
    iter: T[],
    f: (val: T) => number | false,
): [number, T | undefined] {
    let lowestScore = Infinity
    let bestVal: T | undefined

    for (const val of iter) {
        const score = f(val)
        if (score === false) continue
        if (score >= lowestScore) continue

        lowestScore = score
        bestVal = val
    }

    return [lowestScore, bestVal]
}

/**
 * Sorts an array in place. This method mutates the array and returns a reference to the same array.
 * Like `array.sort((a, b) => score(a)-score(b))` but with cache
 */
export function sortBy<T>(array: T[], score: (t: T) => number, reversed?: true): T[] {
    const reverseSign = reversed ? -1 : 1
    const cache = new Map(array.map(t => [t, score(t) * reverseSign]))
    return array.sort((a, b) => cache.get(a) - cache.get(b))
}

export function randomOf<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]
}

export function visualizePath(
    path: RoomPosition[],
    color: string = customColors.yellow,
    visualize: boolean = global.settings.roomVisuals,
) {
    if (!visualize) return

    for (let i = 0; i < path.length; i++) {
        const nextPos = path[i + 1]
        if (!nextPos) break
        const pos = path[i]
        if (nextPos.roomName !== pos.roomName) continue

        new RoomVisual(pos.roomName).line(pos, nextPos, {
            color,
            opacity: 0.2,
        })
    }
}

/**
 * Linearly checks if a given player name matches one of our allies
 */
export function isAlly(playerName: string) {
    const playerMemory = Memory.players[playerName]
    if (!playerMemory) return false

    if (playerMemory[PlayerMemoryKeys.relationship] !== 'ally') return false
    return true
}

export function outOfBucket() {

    collectiveManager.logs = ''
    customLog('Skipping tick due to low bucket, bucket remaining', Game.cpu.bucket, {
        type: LogTypes.warning,
    })
    console.log(
        global.settings.logging
            ? collectiveManager.logs
            : `Skipping tick due to low bucket, bucket remaining ${Game.cpu.bucket}`,
    )
}

/**
 * Finds your username
 */
export function getMe() {
    if (Memory.me) return Memory.me

    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName]
        if (!room.controller) continue
        if (!room.controller.my) continue

        return room.controller.owner.username
    }

    throw Error('Could not find me')
}
