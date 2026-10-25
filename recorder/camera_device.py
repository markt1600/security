"""Resolve the requested Windows DirectShow camera without falling back."""
def select_camera(devices, name):
    matches = [i for i, device in enumerate(devices) if device.casefold() == name.casefold()]
    if len(matches) != 1:
        raise RuntimeError(f'Expected one {name!r}; found {len(matches)}. Connected cameras: {devices}')
    return matches[0]


def resolve_camera(name):
    from pygrabber.dshow_graph import FilterGraph
    devices = FilterGraph().get_input_devices()
    return select_camera(devices, name)
