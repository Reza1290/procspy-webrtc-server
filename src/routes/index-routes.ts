import { Router } from 'express'

export default (router: Router): void => {
    router.get('/', (req, res, next) => {
        res.send(`Hi This Is WebRTC Server :D Use Dashboard to join!`)
        return next()
    })

    router.get('/api/signin/:token', async (req, res, next) => {
        const authData = await auth(req.params.token)
        res.send(authData)
    })
}

const auth = async (token: string): Promise<any> => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
        const response = await fetch(`${process.env.ENDPOINT || "http://192.168.2.5:5050"}/api/signin/${token}`)

        const data = await response.json()
        if (response.ok) {
            if (data?.user) {
                return data
            }
        }
        return data

    } catch (e) {
    }
    return { error: "" }
}