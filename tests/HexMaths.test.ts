import { describe, it, expect } from 'vitest'
import HexMath from '../src/hex/HexMath'

describe('HexMath', () => {
  it('has default values when created with empty config', () => {
    const instance = new HexMath({})
    expect(instance.size).toBe(1)
    expect(instance.orientation).toBe('pointy')
  })

  it('respects custom size', () => {
    const instance = new HexMath({ size: 32 })
    expect(instance.size).toBe(32)
  })

  it('respects custom orientation', () => {
    const instance = new HexMath({ orientation: 'flat' })
    expect(instance.orientation).toBe('flat')
  })

  it('creates independent instances with different configs', () => {
    const a = new HexMath({ size: 10 })
    const b = new HexMath({ size: 99 })
    expect(a).not.toBe(b)
    expect(a.size).toBe(10)
    expect(b.size).toBe(99)
  })
})
