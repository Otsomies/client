import { get, clamp } from 'lodash'
import { Map } from 'immutable'
import Participants, { setPlayerStatus } from './Participants.js'

export default function Telemetry(matchData, telemetry, focusedPlayerName) {
    const epoch = new Date(matchData.playedAt).getTime()

    let state = Map({
        players: Participants(matchData, focusedPlayerName),
        safezone: Map({ x: 0, y: 0, radius: 0 }),
        bluezone: Map({ x: 0, y: 0, radius: 0 }),
        redzone: Map({ x: 0, y: 0, radius: 0 }),
    })

    const cache = new Array(matchData.durationSeconds + 1)
    let currentSecond = 0

    telemetry.forEach(d => {
        if (new Date(d._D).getTime() - epoch > currentSecond * 1000) {
            const playersArray = state.get('players').reverse().valueSeq().toArray()
                .filter(p => p.get('name'))

            const finalizedState = state.set('players', playersArray)
            cache[currentSecond] = finalizedState

            currentSecond++
        }

        if (get(d, 'character.name')) {
            const { name, location } = d.character

            state = state.withMutations(s => {
                s.setIn(['players', name, 'location'], location)
            })
        }

        if (d._T === 'LogPlayerKill') {
            state = state.withMutations(s => {
                const victimPath = ['players', d.victim.name]

                const victim = setPlayerStatus(s.getIn(victimPath), 'dead')
                s.deleteIn(victimPath)
                s.setIn(victimPath, victim)

                if (d.killer.name) {
                    const killerPath = ['players', d.killer.name]
                    const killer = s.getIn(killerPath)
                    s.setIn(killerPath, killer.set('kills', killer.get('kills') + 1))
                }
            })
        }

        if (d._T === 'LogGameStatePeriodic') {
            const gs = d.gameState

            state = state.withMutations(s => {
                s.set('bluezone', Map({ ...gs.safetyZonePosition, radius: gs.safetyZoneRadius }))
                s.set('safezone', Map({ ...gs.poisonGasWarningPosition, radius: gs.poisonGasWarningRadius }))
                s.set('redzone', Map({ ...gs.redZonePosition, radius: gs.redZoneRadius }))
            })
        }
    })

    function stateAt(secondsSinceEpoch) {
        return cache[clamp(secondsSinceEpoch, 1, currentSecond - 1)]
    }

    return {
        stateAt,
    }
}
