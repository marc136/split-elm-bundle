port module BrowserElement exposing (..)

import Browser
import Html exposing (Html)
import Html.Attributes
import Html.Events exposing (onClick)
import One.Strings


main =
    Browser.element
        { init = init
        , update = update
        , subscriptions = subscriptions
        , view = view
        }



-- MODEL


type alias Model =
    Int



-- INIT


init : Flags -> ( Model, Cmd Msg )
init flags =
    ( flags, outgoing () )


type alias Flags =
    Int



-- UPDATE


type Msg
    = Increment
    | IncrementViaPort

update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Increment ->
            ( model + 1, Cmd.none )

        IncrementViaPort ->
            ( model, outgoing () )


-- SUBSCRIPTION


subscriptions : Model -> Sub Msg
subscriptions model =
    incoming (always Increment)



-- PORTS


port outgoing : () -> Cmd msg


port incoming : (Int -> msg) -> Sub msg



-- VIEW


view : Model -> Html Msg
view number =
    Html.div [ Html.Attributes.id "BrowserElement" ]
        [ Html.h1 [] [ Html.text "BrowserElement" ]
        , Html.ol []
            [ Html.li [ Html.Attributes.id "self" ]
                [ Html.text self ]
            , Html.li [ Html.Attributes.id "string1" ]
                [ Html.text One.Strings.string1 ]
            , Html.li [ Html.Attributes.id "string12" ]
                [ Html.text One.Strings.string12 ]           
            , Html.li []
                [ Html.text "number:"
                , Html.span [ Html.Attributes.id "number" ] [ Html.text <| String.fromInt number ]
                ]
            , Html.li [] [ Html.button [ onClick Increment ] [ Html.text "+" ] ]
            , Html.li [] [ Html.button [ onClick IncrementViaPort ] [ Html.text "+ (Port)" ] ]
            ]
        ]


self =
    "#self:0"
