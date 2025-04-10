import { Router } from 'express'

export default (router: Router): void => {
    router.get('/', (req, res, next) => {
        res.send(`Hi This Is WebRTC Server :D Use Dashboard to join!`)
        return next()
    })
}
